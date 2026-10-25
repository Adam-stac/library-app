package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.library.EditionController.EditionInput;
import io.github.adamstac.libraryapp.library.EditionController.PriceInput;
import io.github.adamstac.libraryapp.library.BookmarkService.Bookmark;
import io.github.adamstac.libraryapp.library.EditionController.PublishedInput;
import io.github.adamstac.libraryapp.library.WorkService.WorkSummary;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's editions: the copies on their shelf (ADR 0006, ADR 0007). Each belongs to one of the owner's works and
 * records its imprint, where it is kept, when it was bought and for how much, and when reading started and
 * finished. Every query includes the owner's ID, so someone else's edition is "not found", exactly like one that
 * doesn't exist.
 */
@Service
class EditionService {

    static final int MAX_EDITIONS_PER_ACCOUNT = 10_000;
    static final int MAX_TITLE = 500;
    static final int MAX_TRANSLATOR = 200;
    static final int MAX_MUHAQQIQ = 300;
    static final int MAX_PUBLISHER = 200;
    static final int MAX_PUBLICATION_PLACE = 200;
    static final int MAX_SHELF = 100;
    static final int MAX_NOTES = 10_000;
    static final int MAX_EDITION_NUMBER = 999;
    static final int MAX_VOLUMES = 500;
    static final int MAX_HIJRI = 1500;
    static final int MAX_CE = 2100;
    static final LocalDate EARLIEST_DATE = LocalDate.of(1900, 1, 1);
    private static final Set<String> LANGUAGES = Set.of(Locale.getISOLanguages());

    public record Published(Integer hijri, Integer ce) {}

    /** The amount is decimal text in the currency's decimal places, e.g. {"amount":"95.00","currency":"GBP"}. */
    public record Price(String amount, String currency) {}

    public record Edition(
            UUID id,
            WorkSummary work,
            String title,
            String language,
            String translator,
            String muhaqqiq,
            String publisher,
            String publicationPlace,
            Published published,
            Integer editionNumber,
            Integer volumes,
            String isbn,
            String legalDeposit,
            String shelf,
            String notes,
            LocalDate purchasedOn,
            Price price,
            LocalDate startedOn,
            LocalDate finishedOn,
            String status,
            Bookmark bookmark,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    /** One row of the list. {@code status} is not_started, reading or finished, worked out from the dates. */
    public record EditionSummary(
            UUID id,
            WorkSummary work,
            String title,
            Integer volumes,
            LocalDate purchasedOn,
            String status,
            Bookmark bookmark) {}

    public record Page(List<EditionSummary> items, int page, int size, long total) {}

    /** How a list is ordered: by title (Arabic or English first), or newest first. */
    enum Sort {
        AR("library_sort_key(coalesce(e.title, w.title_ar, w.title_en)), e.id"),
        EN("library_sort_key(coalesce(e.title, w.title_en, w.title_ar)), e.id"),
        ADDED("e.created_at DESC, e.id");

        private final String order;

        Sort(String order) {
            this.order = order;
        }
    }

    private record Fields(
            String title,
            String language,
            String translator,
            String muhaqqiq,
            String publisher,
            String publicationPlace,
            Integer publishedHijri,
            Integer publishedCe,
            Integer editionNumber,
            Integer volumes,
            String isbn,
            String legalDeposit,
            String shelf,
            String notes,
            LocalDate purchasedOn,
            Long priceMinor,
            String priceCurrency,
            LocalDate startedOn,
            LocalDate finishedOn) {}

    /** A row of the editions table, before its work's summary is added. */
    private record Row(UUID workId, Edition edition) {}

    private static final String COLUMNS = """
            e.id, e.work_id, e.title, e.language, e.translator, e.muhaqqiq, e.publisher, e.publication_place,
            e.published_hijri, e.published_ce, e.edition_number, e.volumes, e.isbn, e.legal_deposit, e.shelf,
            e.notes, e.purchased_on, e.price_minor, e.price_currency, e.started_on, e.finished_on,
            e.version, e.created_at, e.updated_at,
            b.volume AS bookmark_volume, b.page AS bookmark_page, b.moved_at AS bookmark_moved_at
            """;
    private static final String WITH_BOOKMARK = " LEFT JOIN bookmarks b ON b.edition_id = e.id";

    private final JdbcClient jdbc;
    private final WorkService works;

    EditionService(JdbcClient jdbc, WorkService works) {
        this.jdbc = jdbc;
        this.works = works;
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /** A page of the owner's editions, optionally only those of one work. */
    Page list(UUID ownerId, UUID workId, Sort sort, int page, int size) {
        // Built only from fixed strings in this class, never from user input; the values are parameters
        String where = "e.owner_id = :owner" + (workId == null ? "" : " AND e.work_id = :work");
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*) FROM editions e WHERE " + where)
                .param("owner", ownerId);
        JdbcClient.StatementSpec select = jdbc.sql("SELECT " + COLUMNS
                        + " FROM editions e JOIN works w ON w.id = e.work_id" + WITH_BOOKMARK + " WHERE " + where
                        + " ORDER BY " + sort.order + " LIMIT :limit OFFSET :offset")
                .param("owner", ownerId)
                .param("limit", size)
                .param("offset", (long) page * size);
        if (workId != null) {
            count = count.param("work", workId);
            select = select.param("work", workId);
        }
        long total = count.query(Long.class).single();
        List<Row> rows = select.query(EditionService::row).list();
        Map<UUID, WorkSummary> workSummaries = works.summaries(ownerId, rows.stream().map(Row::workId).distinct().toList());
        List<EditionSummary> items = rows.stream()
                .map(row -> {
                    Edition edition = row.edition();
                    return new EditionSummary(
                            edition.id(),
                            workSummaries.get(row.workId()),
                            edition.title(),
                            edition.volumes(),
                            edition.purchasedOn(),
                            edition.status(),
                            edition.bookmark());
                })
                .toList();
        return new Page(items, page, size, total);
    }

    Edition get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Edition> find(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM editions e" + WITH_BOOKMARK
                        + " WHERE e.id = :id AND e.owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .query(EditionService::row)
                .optional()
                .map(row -> withWork(row, works.summaries(ownerId, List.of(row.workId())).get(row.workId())));
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    /** Adds an edition of an existing work ({@code workId}), or of a new work ({@code work}), in one go. */
    @Transactional
    Edition create(UUID ownerId, EditionInput input) {
        Fields fields = validate(input);
        if ((input.workId() == null) == (input.work() == null)) {
            throw new FieldValidationException("workId", input.workId() == null ? "work_required" : "work_or_work_id");
        }
        // One add at a time per account, so two requests at once can't both squeeze under the limit
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "editions:" + ownerId)
                .query()
                .listOfRows();
        long count = jdbc.sql("SELECT count(*) FROM editions WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_EDITIONS_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID workId = input.workId() != null ? checkedWork(ownerId, input.workId()) : newWork(ownerId, input);
        UUID id = UUID.randomUUID();
        bind(jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id, title, language, translator, muhaqqiq, publisher,
                                              publication_place, published_hijri, published_ce, edition_number,
                                              volumes, isbn, legal_deposit, shelf, notes, purchased_on,
                                              price_minor, price_currency, started_on, finished_on)
                        VALUES (:id, :owner, :work, :title, :language, :translator, :muhaqqiq, :publisher,
                                :publicationPlace, :publishedHijri, :publishedCe, :editionNumber,
                                :volumes, :isbn, :legalDeposit, :shelf, :notes, :purchasedOn,
                                :priceMinor, :priceCurrency, :startedOn, :finishedOn)
                        """), fields)
                .param("id", id)
                .param("owner", ownerId)
                .param("work", workId)
                .update();
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the edition since {@code expectedVersion} was read. */
    @Transactional
    Edition update(UUID ownerId, UUID id, int expectedVersion, EditionInput input) {
        Fields fields = validate(input);
        if (input.work() != null) {
            throw new FieldValidationException("work", "not_allowed"); // a new work is only made with a new edition
        }
        if (input.workId() == null) {
            throw new FieldValidationException("workId", "work_required");
        }
        UUID workId = checkedWork(ownerId, input.workId());
        refuseFewerVolumesThanTheBookmark(ownerId, id, fields.volumes());
        int changed = bind(jdbc.sql("""
                        UPDATE editions SET work_id = :work, title = :title, language = :language,
                               translator = :translator, muhaqqiq = :muhaqqiq, publisher = :publisher,
                               publication_place = :publicationPlace, published_hijri = :publishedHijri,
                               published_ce = :publishedCe, edition_number = :editionNumber, volumes = :volumes,
                               isbn = :isbn, legal_deposit = :legalDeposit, shelf = :shelf, notes = :notes,
                               purchased_on = :purchasedOn, price_minor = :priceMinor,
                               price_currency = :priceCurrency, started_on = :startedOn, finished_on = :finishedOn,
                               version = version + 1, updated_at = now()
                        WHERE id = :id AND owner_id = :owner AND version = :version
                        """), fields)
                .param("work", workId)
                .param("id", id)
                .param("owner", ownerId)
                .param("version", expectedVersion)
                .update();
        if (changed == 0) {
            if (find(ownerId, id).isPresent()) {
                throw new ConflictException("stale_version");
            }
            throw new NotFoundException();
        }
        return get(ownerId, id);
    }

    @Transactional
    void delete(UUID ownerId, UUID id) {
        int deleted = jdbc.sql("DELETE FROM editions WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
        if (deleted == 0) {
            throw new NotFoundException();
        }
    }

    /**
     * An edit can't leave the bookmark, or a benefit, in a volume the edition no longer has (say, 13 volumes changed
     * to 3 while the bookmark is in volume 5). The edition is locked first, so neither can be saved meanwhile.
     */
    private void refuseFewerVolumesThanTheBookmark(UUID ownerId, UUID id, Integer volumes) {
        jdbc.sql("SELECT id FROM editions WHERE id = :id AND owner_id = :owner FOR UPDATE")
                .param("id", id)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional();
        if (volumes == null) {
            return; // unknown: any volume is possible
        }
        boolean beyond = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM bookmarks
                                       WHERE edition_id = :id AND owner_id = :owner AND volume > :volumes)
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .param("volumes", volumes)
                .query(Boolean.class)
                .single();
        if (beyond) {
            throw new FieldValidationException("volumes", "below_bookmark");
        }
        boolean citedBeyond = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM benefits
                                       WHERE edition_id = :id AND owner_id = :owner AND volume > :volumes)
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .param("volumes", volumes)
                .query(Boolean.class)
                .single();
        if (citedBeyond) {
            throw new FieldValidationException("volumes", "below_benefit");
        }
    }

    /** The work must be the owner's; another user's gives the same answer as one that doesn't exist. */
    private UUID checkedWork(UUID ownerId, UUID workId) {
        if (!works.usableBy(ownerId, workId)) {
            throw new FieldValidationException("workId", "unknown_work");
        }
        return workId;
    }

    /** Adds the new work in the same transaction; its errors are reported as fields of "work". */
    private UUID newWork(UUID ownerId, EditionInput input) {
        try {
            return works.create(ownerId, input.work()).id();
        } catch (FieldValidationException invalid) {
            throw new FieldValidationException("work." + invalid.field(), invalid.code());
        }
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    private static Fields validate(EditionInput input) {
        PublishedInput published = input.published() == null ? new PublishedInput(null, null) : input.published();
        Integer hijri = published.hijri();
        Integer ce = published.ce();
        if (hijri != null && (hijri < 1 || hijri > MAX_HIJRI)) {
            throw new FieldValidationException("published.hijri", "invalid_year");
        }
        if (ce != null && (ce < 1 || ce > MAX_CE)) {
            throw new FieldValidationException("published.ce", "invalid_year");
        }
        LocalDate purchasedOn = date("purchasedOn", input.purchasedOn());
        LocalDate startedOn = date("startedOn", input.startedOn());
        LocalDate finishedOn = date("finishedOn", input.finishedOn());
        if (finishedOn != null && startedOn == null) {
            throw new FieldValidationException("startedOn", "start_required");
        }
        if (finishedOn != null && finishedOn.isBefore(startedOn)) {
            throw new FieldValidationException("finishedOn", "before_start");
        }
        Long priceMinor = null;
        String priceCurrency = null;
        PriceInput price = input.price();
        if (price != null && (price.amount() != null || (price.currency() != null && !price.currency().isBlank()))) {
            priceCurrency = Money.currency("price.currency", price.currency());
            if (priceCurrency == null) {
                throw new FieldValidationException("price.currency", "currency_required");
            }
            if (price.amount() == null) {
                throw new FieldValidationException("price.amount", "amount_required");
            }
            priceMinor = Money.minorUnits("price.amount", price.amount(), priceCurrency);
        }
        return new Fields(
                TextInput.line("title", input.title(), MAX_TITLE),
                language(input.language()),
                TextInput.line("translator", input.translator(), MAX_TRANSLATOR),
                TextInput.line("muhaqqiq", input.muhaqqiq(), MAX_MUHAQQIQ),
                TextInput.line("publisher", input.publisher(), MAX_PUBLISHER),
                TextInput.line("publicationPlace", input.publicationPlace(), MAX_PUBLICATION_PLACE),
                hijri,
                ce,
                number("editionNumber", input.editionNumber(), MAX_EDITION_NUMBER),
                number("volumes", input.volumes(), MAX_VOLUMES),
                PrintedNumbers.isbn(input.isbn()),
                PrintedNumbers.legalDeposit(input.legalDeposit()),
                TextInput.line("shelf", input.shelf(), MAX_SHELF),
                TextInput.paragraphs("notes", input.notes(), MAX_NOTES),
                purchasedOn,
                priceMinor,
                priceCurrency,
                startedOn,
                finishedOn);
    }

    /** A two-letter ISO 639-1 code (ar, en, ur…), in small letters; null when blank. */
    private static String language(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String code = value.strip().toLowerCase(Locale.ROOT);
        if (!code.matches("[a-z]{2}") || !LANGUAGES.contains(code)) {
            throw new FieldValidationException("language", "invalid_language");
        }
        return code;
    }

    private static Integer number(String field, Integer value, int max) {
        if (value != null && (value < 1 || value > max)) {
            throw new FieldValidationException(field, "invalid_number");
        }
        return value;
    }

    /** Not before 1900 and not in the future; a day's leeway allows for time zones ahead of UTC. */
    private static LocalDate date(String field, LocalDate value) {
        if (value == null) {
            return null;
        }
        if (value.isBefore(EARLIEST_DATE)) {
            throw new FieldValidationException(field, "invalid_date");
        }
        if (value.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1))) {
            throw new FieldValidationException(field, "in_the_future");
        }
        return value;
    }

    private static String status(LocalDate startedOn, LocalDate finishedOn) {
        if (finishedOn != null) {
            return "finished";
        }
        return startedOn != null ? "reading" : "not_started";
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement, Fields fields) {
        return statement
                .param("title", fields.title(), Types.VARCHAR)
                .param("language", fields.language(), Types.VARCHAR)
                .param("translator", fields.translator(), Types.VARCHAR)
                .param("muhaqqiq", fields.muhaqqiq(), Types.VARCHAR)
                .param("publisher", fields.publisher(), Types.VARCHAR)
                .param("publicationPlace", fields.publicationPlace(), Types.VARCHAR)
                .param("publishedHijri", fields.publishedHijri(), Types.INTEGER)
                .param("publishedCe", fields.publishedCe(), Types.INTEGER)
                .param("editionNumber", fields.editionNumber(), Types.INTEGER)
                .param("volumes", fields.volumes(), Types.INTEGER)
                .param("isbn", fields.isbn(), Types.VARCHAR)
                .param("legalDeposit", fields.legalDeposit(), Types.VARCHAR)
                .param("shelf", fields.shelf(), Types.VARCHAR)
                .param("notes", fields.notes(), Types.VARCHAR)
                .param("purchasedOn", fields.purchasedOn(), Types.DATE)
                .param("priceMinor", fields.priceMinor(), Types.BIGINT)
                .param("priceCurrency", fields.priceCurrency(), Types.VARCHAR)
                .param("startedOn", fields.startedOn(), Types.DATE)
                .param("finishedOn", fields.finishedOn(), Types.DATE);
    }

    private static Row row(ResultSet rs, int rowNum) throws SQLException {
        LocalDate startedOn = rs.getObject("started_on", LocalDate.class);
        LocalDate finishedOn = rs.getObject("finished_on", LocalDate.class);
        Long priceMinor = rs.getObject("price_minor", Long.class);
        String currency = rs.getString("price_currency");
        Edition edition = new Edition(
                rs.getObject("id", UUID.class),
                null,
                rs.getString("title"),
                rs.getString("language"),
                rs.getString("translator"),
                rs.getString("muhaqqiq"),
                rs.getString("publisher"),
                rs.getString("publication_place"),
                new Published(rs.getObject("published_hijri", Integer.class), rs.getObject("published_ce", Integer.class)),
                rs.getObject("edition_number", Integer.class),
                rs.getObject("volumes", Integer.class),
                rs.getString("isbn"),
                rs.getString("legal_deposit"),
                rs.getString("shelf"),
                rs.getString("notes"),
                rs.getObject("purchased_on", LocalDate.class),
                priceMinor == null ? null : new Price(Money.amount(priceMinor, currency), currency),
                startedOn,
                finishedOn,
                status(startedOn, finishedOn),
                bookmark(rs),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
        return new Row(rs.getObject("work_id", UUID.class), edition);
    }

    private static Bookmark bookmark(ResultSet rs) throws SQLException {
        Integer page = rs.getObject("bookmark_page", Integer.class);
        return page == null
                ? null
                : new Bookmark(
                        rs.getObject("bookmark_volume", Integer.class),
                        page,
                        rs.getObject("bookmark_moved_at", OffsetDateTime.class));
    }

    private static Edition withWork(Row row, WorkSummary work) {
        Edition e = row.edition();
        return new Edition(e.id(), work, e.title(), e.language(), e.translator(), e.muhaqqiq(), e.publisher(),
                e.publicationPlace(), e.published(), e.editionNumber(), e.volumes(), e.isbn(), e.legalDeposit(),
                e.shelf(), e.notes(), e.purchasedOn(), e.price(), e.startedOn(), e.finishedOn(), e.status(),
                e.bookmark(), e.version(), e.createdAt(), e.updatedAt());
    }
}
