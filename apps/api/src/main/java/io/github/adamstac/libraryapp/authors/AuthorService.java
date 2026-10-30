package io.github.adamstac.libraryapp.authors;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.authors.AuthorController.AuthorInput;
import io.github.adamstac.libraryapp.authors.AuthorController.YearInput;
import io.github.adamstac.libraryapp.places.Places;
import io.github.adamstac.libraryapp.places.Places.PlaceName;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's authors. Every query includes the owner's ID, so one account can never see or change another's
 * authors: someone else's author is "not found", exactly like one that doesn't exist (ADR 0006). An author's birth
 * and death places must be places the owner may use (their own or the shared list), checked through the places
 * module's public interface.
 */
@Service
class AuthorService implements Authors {

    static final int MAX_AUTHORS_PER_ACCOUNT = 2000;
    static final int MAX_NAME = 200;
    static final int MAX_FULL_NAME = 500;
    static final int MAX_NAME_PART = 200;
    static final int MAX_BIOGRAPHY = 10_000;
    /** Negative Hijri years are before the Hijra (BH); negative CE years are BCE. There is no year 0. */
    static final int MIN_HIJRI = -2000;
    static final int MAX_HIJRI = 1500;
    static final int MIN_CE = -1500;
    static final int MAX_CE = 2100;

    public record Year(Integer hijri, Integer ce, boolean approximate) {}

    public record Author(
            UUID id,
            String nameAr,
            String nameEn,
            String fullName,
            String ism,
            String kunya,
            String laqab,
            String nisba,
            Year birth,
            Year death,
            PlaceName birthPlace,
            PlaceName deathPlace,
            String biography,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    /** One row of the list: enough to show the name and years. */
    public record AuthorSummary(UUID id, String nameAr, String nameEn, Year birth, Year death) {}

    public record Page(List<AuthorSummary> items, int page, int size, long total) {}

    /** Input that has passed every rule, ready to store. */
    private record Fields(
            String nameAr,
            String nameEn,
            String fullName,
            String ism,
            String kunya,
            String laqab,
            String nisba,
            Year birth,
            Year death,
            UUID birthPlaceId,
            UUID deathPlaceId,
            String biography) {}

    private static final String COLUMNS = """
            id, name_ar, name_en, full_name, ism, kunya, laqab, nisba,
            birth_year_hijri, birth_year_ce, birth_approximate, death_year_hijri, death_year_ce, death_approximate,
            birth_place_id, death_place_id, biography, version, created_at, updated_at
            """;

    private final JdbcClient jdbc;
    private final Places places;
    private final List<AuthorReferences> references;

    AuthorService(JdbcClient jdbc, Places places, List<AuthorReferences> references) {
        this.jdbc = jdbc;
        this.places = places;
        this.references = references;
    }

    // ---- For other modules (Authors) ---------------------------------------------------------------------------

    @Override
    public boolean usableBy(UUID ownerId, UUID authorId) {
        // FOR KEY SHARE: the author can't be deleted until the caller's transaction ends (many callers can hold it)
        return jdbc.sql("SELECT id FROM authors WHERE id = :id AND owner_id = :owner FOR KEY SHARE")
                .param("id", authorId)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    @Override
    public Map<UUID, AuthorName> names(UUID ownerId, Collection<UUID> authorIds) {
        if (authorIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("SELECT id, name_ar, name_en FROM authors WHERE id IN (:ids) AND owner_id = :owner")
                .param("ids", List.copyOf(authorIds))
                .param("owner", ownerId)
                .query((rs, rowNum) -> new AuthorName(
                        rs.getObject("id", UUID.class), rs.getString("name_ar"), rs.getString("name_en")))
                .list()
                .stream()
                .collect(Collectors.toMap(AuthorName::id, name -> name));
    }

    @Override
    public List<Death> deaths(UUID ownerId) {
        return jdbc.sql("""
                        SELECT id, name_ar, name_en, death_year_hijri, death_year_ce, death_approximate
                        FROM authors WHERE owner_id = :owner
                        ORDER BY library_sort_key(coalesce(name_ar, name_en)), id
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> new Death(
                        rs.getObject("id", UUID.class),
                        rs.getString("name_ar"),
                        rs.getString("name_en"),
                        rs.getObject("death_year_hijri", Integer.class),
                        rs.getObject("death_year_ce", Integer.class),
                        rs.getBoolean("death_approximate")))
                .list();
    }

    @Override
    public long count(UUID ownerId) {
        return jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
    }

    @Override
    public Found search(UUID ownerId, String text, int limit) {
        // ESCAPE: library_like_pattern turns % and _ in the text into ordinary characters
        String matching = "owner_id = :owner AND search_key LIKE library_like_pattern(:text) ESCAPE '\\'";
        long total = jdbc.sql("SELECT count(*) FROM authors WHERE " + matching)
                .param("owner", ownerId)
                .param("text", text)
                .query(Long.class)
                .single();
        List<AuthorName> items = jdbc.sql("SELECT id, name_ar, name_en FROM authors WHERE " + matching
                        + " ORDER BY library_sort_key(coalesce(name_ar, name_en)), id LIMIT :limit")
                .param("owner", ownerId)
                .param("text", text)
                .param("limit", limit)
                .query((rs, rowNum) -> new AuthorName(
                        rs.getObject("id", UUID.class), rs.getString("name_ar"), rs.getString("name_en")))
                .list();
        return new Found(items, total);
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /**
     * A page of the owner's authors, sorted by the Arabic or the English name (falling back to the other),
     * ignoring a leading "ال" or "al-", vowel marks and the forms of alif (V16).
     */
    Page list(UUID ownerId, int page, int size, boolean arabicFirst) {
        long total = jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        String order = arabicFirst
                ? "library_sort_key(coalesce(name_ar, name_en)), library_sort_key(coalesce(name_en, name_ar)), id"
                : "library_sort_key(coalesce(name_en, name_ar)), library_sort_key(coalesce(name_ar, name_en)), id";
        List<AuthorSummary> items = jdbc.sql("""
                        SELECT id, name_ar, name_en,
                               birth_year_hijri, birth_year_ce, birth_approximate,
                               death_year_hijri, death_year_ce, death_approximate
                        FROM authors WHERE owner_id = :owner
                        ORDER BY %s
                        LIMIT :limit OFFSET :offset
                        """.formatted(order)) // one of two fixed strings above, never user input
                .param("owner", ownerId)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query((rs, rowNum) -> new AuthorSummary(
                        rs.getObject("id", UUID.class),
                        rs.getString("name_ar"),
                        rs.getString("name_en"),
                        year(rs, "birth"),
                        year(rs, "death")))
                .list();
        return new Page(items, page, size, total);
    }

    Author get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Author> find(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM authors WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .query(AuthorService::author)
                .optional()
                .map(author -> withPlaceNames(ownerId, author));
    }

    /** Fills in the names of the author's places, which belong to the places module. */
    private Author withPlaceNames(UUID ownerId, Author author) {
        List<UUID> ids = new ArrayList<>();
        for (PlaceName place : new PlaceName[] {author.birthPlace(), author.deathPlace()}) {
            if (place != null) {
                ids.add(place.id());
            }
        }
        Map<UUID, PlaceName> names = places.names(ownerId, ids);
        return new Author(
                author.id(),
                author.nameAr(),
                author.nameEn(),
                author.fullName(),
                author.ism(),
                author.kunya(),
                author.laqab(),
                author.nisba(),
                author.birth(),
                author.death(),
                author.birthPlace() == null ? null : names.get(author.birthPlace().id()),
                author.deathPlace() == null ? null : names.get(author.deathPlace().id()),
                author.biography(),
                author.version(),
                author.createdAt(),
                author.updatedAt());
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    @Transactional
    Author create(UUID ownerId, AuthorInput input) {
        Fields fields = validate(input);
        checkPlaces(ownerId, fields);
        // One add at a time per account, so two requests at once can't both squeeze under the limit
        // (held until the transaction ends; the function returns nothing, so the row is ignored)
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "authors:" + ownerId)
                .query()
                .listOfRows();
        long count = jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_AUTHORS_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID id = UUID.randomUUID();
        bind(jdbc.sql("""
                        INSERT INTO authors (id, owner_id, name_ar, name_en, full_name, ism, kunya, laqab, nisba,
                                             birth_year_hijri, birth_year_ce, birth_approximate,
                                             death_year_hijri, death_year_ce, death_approximate,
                                             birth_place_id, death_place_id, biography)
                        VALUES (:id, :owner, :nameAr, :nameEn, :fullName, :ism, :kunya, :laqab, :nisba,
                                :birthHijri, :birthCe, :birthApproximate,
                                :deathHijri, :deathCe, :deathApproximate,
                                :birthPlaceId, :deathPlaceId, :biography)
                        """), fields)
                .param("id", id)
                .param("owner", ownerId)
                .update();
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the author since {@code expectedVersion} was read. */
    @Transactional
    Author update(UUID ownerId, UUID id, int expectedVersion, AuthorInput input) {
        Fields fields = validate(input);
        checkPlaces(ownerId, fields);
        int changed = bind(jdbc.sql("""
                        UPDATE authors SET name_ar = :nameAr, name_en = :nameEn, full_name = :fullName,
                               ism = :ism, kunya = :kunya, laqab = :laqab, nisba = :nisba,
                               birth_year_hijri = :birthHijri, birth_year_ce = :birthCe,
                               birth_approximate = :birthApproximate,
                               death_year_hijri = :deathHijri, death_year_ce = :deathCe,
                               death_approximate = :deathApproximate,
                               birth_place_id = :birthPlaceId, death_place_id = :deathPlaceId,
                               biography = :biography, version = version + 1, updated_at = now()
                        WHERE id = :id AND owner_id = :owner AND version = :version
                        """), fields)
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

    /** Deletes one of the user's authors, unless one of their records still names them (409 in_use). */
    @Transactional
    void delete(UUID ownerId, UUID id) {
        // Waits for any transaction that is naming this author (usableBy), so the count below includes it
        boolean exists = jdbc.sql("SELECT id FROM authors WHERE id = :id AND owner_id = :owner FOR UPDATE")
                .param("id", id)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
        if (!exists) {
            throw new NotFoundException();
        }
        Map<String, Long> usedBy = new LinkedHashMap<>();
        for (AuthorReferences reference : references) {
            long count = reference.countUsing(ownerId, id);
            if (count > 0) {
                usedBy.put(reference.kind(), count);
            }
        }
        if (!usedBy.isEmpty()) {
            throw new ConflictException("in_use", Map.<String, Object>of("usedBy", usedBy));
        }
        jdbc.sql("DELETE FROM authors WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    /**
     * Each place must be one the owner may use: their own or on the shared list. Another user's place is refused
     * exactly like one that doesn't exist. Called inside the transaction that stores the author, so the places
     * can't be deleted before it ends (Places.usableBy).
     */
    private void checkPlaces(UUID ownerId, Fields fields) {
        if (fields.birthPlaceId() != null && !places.usableBy(ownerId, fields.birthPlaceId())) {
            throw new FieldValidationException("birthPlaceId", "unknown_place");
        }
        if (fields.deathPlaceId() != null && !places.usableBy(ownerId, fields.deathPlaceId())) {
            throw new FieldValidationException("deathPlaceId", "unknown_place");
        }
    }

    private static Fields validate(AuthorInput input) {
        String nameAr = TextInput.line("nameAr", input.nameAr(), MAX_NAME);
        String nameEn = TextInput.line("nameEn", input.nameEn(), MAX_NAME);
        if (nameAr == null && nameEn == null) {
            throw new FieldValidationException("nameAr", "name_required");
        }
        Year birth = year("birth", input.birth());
        Year death = year("death", input.death());
        if (birth.hijri() != null && death.hijri() != null && death.hijri() < birth.hijri()) {
            throw new FieldValidationException("death.hijri", "before_birth");
        }
        if (birth.ce() != null && death.ce() != null && death.ce() < birth.ce()) {
            throw new FieldValidationException("death.ce", "before_birth");
        }
        return new Fields(
                nameAr,
                nameEn,
                TextInput.line("fullName", input.fullName(), MAX_FULL_NAME),
                TextInput.line("ism", input.ism(), MAX_NAME_PART),
                TextInput.line("kunya", input.kunya(), MAX_NAME_PART),
                TextInput.line("laqab", input.laqab(), MAX_NAME_PART),
                TextInput.line("nisba", input.nisba(), MAX_NAME_PART),
                birth,
                death,
                input.birthPlaceId(),
                input.deathPlaceId(),
                TextInput.paragraphs("biography", input.biography(), MAX_BIOGRAPHY));
    }

    private static Year year(String field, YearInput input) {
        if (input == null) {
            return new Year(null, null, false);
        }
        Integer hijri = input.hijri();
        Integer ce = input.ce();
        if (hijri != null && (hijri == 0 || hijri < MIN_HIJRI || hijri > MAX_HIJRI)) {
            throw new FieldValidationException(field + ".hijri", "invalid_year");
        }
        if (ce != null && (ce == 0 || ce < MIN_CE || ce > MAX_CE)) {
            throw new FieldValidationException(field + ".ce", "invalid_year");
        }
        // "About" only means something when there is a year
        boolean approximate = Boolean.TRUE.equals(input.approximate()) && (hijri != null || ce != null);
        return new Year(hijri, ce, approximate);
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement, Fields fields) {
        return statement
                .param("nameAr", fields.nameAr(), Types.VARCHAR)
                .param("nameEn", fields.nameEn(), Types.VARCHAR)
                .param("fullName", fields.fullName(), Types.VARCHAR)
                .param("ism", fields.ism(), Types.VARCHAR)
                .param("kunya", fields.kunya(), Types.VARCHAR)
                .param("laqab", fields.laqab(), Types.VARCHAR)
                .param("nisba", fields.nisba(), Types.VARCHAR)
                .param("birthHijri", fields.birth().hijri(), Types.INTEGER)
                .param("birthCe", fields.birth().ce(), Types.INTEGER)
                .param("birthApproximate", fields.birth().approximate())
                .param("deathHijri", fields.death().hijri(), Types.INTEGER)
                .param("deathCe", fields.death().ce(), Types.INTEGER)
                .param("deathApproximate", fields.death().approximate())
                .param("birthPlaceId", fields.birthPlaceId(), Types.OTHER)
                .param("deathPlaceId", fields.deathPlaceId(), Types.OTHER)
                .param("biography", fields.biography(), Types.VARCHAR);
    }

    private static Author author(ResultSet rs, int rowNum) throws SQLException {
        return new Author(
                rs.getObject("id", UUID.class),
                rs.getString("name_ar"),
                rs.getString("name_en"),
                rs.getString("full_name"),
                rs.getString("ism"),
                rs.getString("kunya"),
                rs.getString("laqab"),
                rs.getString("nisba"),
                year(rs, "birth"),
                year(rs, "death"),
                placeId(rs, "birth_place_id"),
                placeId(rs, "death_place_id"),
                rs.getString("biography"),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    /** Only the ID for now; withPlaceNames adds the names. */
    private static PlaceName placeId(ResultSet rs, String column) throws SQLException {
        UUID id = rs.getObject(column, UUID.class);
        return id == null ? null : new PlaceName(id, null, null);
    }

    private static Year year(ResultSet rs, String prefix) throws SQLException {
        return new Year(
                rs.getObject(prefix + "_year_hijri", Integer.class),
                rs.getObject(prefix + "_year_ce", Integer.class),
                rs.getBoolean(prefix + "_approximate"));
    }
}
