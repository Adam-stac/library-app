package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.authors.Authors;
import io.github.adamstac.libraryapp.authors.Authors.AuthorName;
import io.github.adamstac.libraryapp.library.WorkController.WorkInput;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's works: the texts themselves, apart from any printed edition (ADR 0006). A work has at most one of the
 * owner's sciences and an ordered list of the owner's authors. Every query includes the owner's ID, so someone
 * else's work is "not found", exactly like one that doesn't exist; and a work can only name the owner's own
 * science and authors.
 */
@Service
class WorkService {

    static final int MAX_WORKS_PER_ACCOUNT = 10_000;
    static final int MAX_TITLE = 500;
    static final int MAX_AUTHORS_PER_WORK = 20;

    /** How a work names its science. */
    public record ScienceName(UUID id, String nameAr, String nameEn) {}

    public record Work(
            UUID id,
            String titleAr,
            String titleEn,
            ScienceName science,
            List<AuthorName> authors,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    /** One row of the list. */
    public record WorkSummary(
            UUID id, String titleAr, String titleEn, ScienceName science, List<AuthorName> authors) {}

    public record Page(List<WorkSummary> items, int page, int size, long total) {}

    /** Optional ways to narrow the list: only one science, or only works naming one author. */
    record Filter(UUID scienceId, UUID authorId) {}

    private record Fields(String titleAr, String titleEn, UUID scienceId, List<UUID> authorIds) {}

    /** A row of the works table, before the authors' names are added. */
    private record Row(
            UUID id,
            String titleAr,
            String titleEn,
            ScienceName science,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    private static final String COLUMNS = """
            w.id, w.title_ar, w.title_en, w.science_id, s.name_ar AS science_ar, s.name_en AS science_en,
            w.version, w.created_at, w.updated_at
            """;
    private static final String FROM = "works w LEFT JOIN sciences s ON s.id = w.science_id";

    private final JdbcClient jdbc;
    private final Authors authors;
    private final ScienceService sciences;

    WorkService(JdbcClient jdbc, Authors authors, ScienceService sciences) {
        this.jdbc = jdbc;
        this.authors = authors;
        this.sciences = sciences;
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /**
     * A page of the owner's works, sorted by the Arabic or the English title (falling back to the other), the way
     * catalogues file them: ignoring a leading "ال" or "al-", vowel marks and the forms of alif (V16).
     */
    Page list(UUID ownerId, Filter filter, int page, int size, boolean arabicFirst) {
        // Built only from fixed strings in this method, never from user input; the values are parameters
        String where = "w.owner_id = :owner"
                + (filter.scienceId() == null ? "" : " AND w.science_id = :science")
                + (filter.authorId() == null
                        ? ""
                        : " AND EXISTS (SELECT 1 FROM work_authors wa WHERE wa.work_id = w.id AND wa.author_id = :author)");
        String order = arabicFirst
                ? "library_sort_key(coalesce(w.title_ar, w.title_en)), "
                        + "library_sort_key(coalesce(w.title_en, w.title_ar)), w.id"
                : "library_sort_key(coalesce(w.title_en, w.title_ar)), "
                        + "library_sort_key(coalesce(w.title_ar, w.title_en)), w.id";
        long total = filtered(jdbc.sql("SELECT count(*) FROM works w WHERE " + where), ownerId, filter)
                .query(Long.class)
                .single();
        List<Row> rows = filtered(jdbc.sql("SELECT " + COLUMNS + " FROM " + FROM + " WHERE " + where
                                + " ORDER BY " + order + " LIMIT :limit OFFSET :offset"), ownerId, filter)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query(WorkService::row)
                .list();
        return new Page(summarise(ownerId, rows), page, size, total);
    }

    /** Short descriptions of the owner's works, by ID (for editions); IDs that aren't the owner's are left out. */
    Map<UUID, WorkSummary> summaries(UUID ownerId, Collection<UUID> workIds) {
        if (workIds.isEmpty()) {
            return Map.of();
        }
        List<Row> rows = jdbc.sql("SELECT " + COLUMNS + " FROM " + FROM + " WHERE w.id IN (:ids) AND w.owner_id = :owner")
                .param("ids", List.copyOf(workIds))
                .param("owner", ownerId)
                .query(WorkService::row)
                .list();
        Map<UUID, WorkSummary> byId = new HashMap<>();
        for (WorkSummary summary : summarise(ownerId, rows)) {
            byId.put(summary.id(), summary);
        }
        return byId;
    }

    /**
     * Whether the work is one of the owner's. Called inside the transaction that adds an edition to it: the work is
     * then locked against deletion until that transaction ends (many callers can hold it).
     */
    boolean usableBy(UUID ownerId, UUID workId) {
        return jdbc.sql("SELECT id FROM works WHERE id = :id AND owner_id = :owner FOR KEY SHARE")
                .param("id", workId)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    private List<WorkSummary> summarise(UUID ownerId, List<Row> rows) {
        Map<UUID, List<AuthorName>> named = authorsOf(ownerId, rows.stream().map(Row::id).toList());
        return rows.stream()
                .map(row -> new WorkSummary(
                        row.id(), row.titleAr(), row.titleEn(), row.science(), named.getOrDefault(row.id(), List.of())))
                .toList();
    }

    private static JdbcClient.StatementSpec filtered(JdbcClient.StatementSpec statement, UUID ownerId, Filter filter) {
        statement = statement.param("owner", ownerId);
        if (filter.scienceId() != null) {
            statement = statement.param("science", filter.scienceId());
        }
        if (filter.authorId() != null) {
            statement = statement.param("author", filter.authorId());
        }
        return statement;
    }

    Work get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Work> find(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM " + FROM + " WHERE w.id = :id AND w.owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .query(WorkService::row)
                .optional()
                .map(row -> new Work(
                        row.id(),
                        row.titleAr(),
                        row.titleEn(),
                        row.science(),
                        authorsOf(ownerId, List.of(row.id())).getOrDefault(row.id(), List.of()),
                        row.version(),
                        row.createdAt(),
                        row.updatedAt()));
    }

    /** The authors of each work, in order, with their names from the authors module. */
    private Map<UUID, List<AuthorName>> authorsOf(UUID ownerId, List<UUID> workIds) {
        if (workIds.isEmpty()) {
            return Map.of();
        }
        record Link(UUID workId, UUID authorId) {}
        List<Link> links = jdbc.sql("""
                        SELECT work_id, author_id FROM work_authors
                        WHERE work_id IN (:works) ORDER BY work_id, position
                        """)
                .param("works", workIds)
                .query((rs, rowNum) -> new Link(rs.getObject("work_id", UUID.class), rs.getObject("author_id", UUID.class)))
                .list();
        Map<UUID, AuthorName> names = authors.names(ownerId, links.stream().map(Link::authorId).distinct().toList());
        Map<UUID, List<AuthorName>> byWork = new HashMap<>();
        for (Link link : links) {
            AuthorName name = names.get(link.authorId());
            if (name != null) {
                byWork.computeIfAbsent(link.workId(), work -> new ArrayList<>()).add(name);
            }
        }
        return byWork;
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    @Transactional
    Work create(UUID ownerId, WorkInput input) {
        Fields fields = validate(input);
        checkLinks(ownerId, fields);
        // One add at a time per account, so two requests at once can't both squeeze under the limit
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "works:" + ownerId)
                .query()
                .listOfRows();
        long count = jdbc.sql("SELECT count(*) FROM works WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_WORKS_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO works (id, owner_id, title_ar, title_en, science_id)
                        VALUES (:id, :owner, :titleAr, :titleEn, :scienceId)
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .param("titleAr", fields.titleAr(), Types.VARCHAR)
                .param("titleEn", fields.titleEn(), Types.VARCHAR)
                .param("scienceId", fields.scienceId(), Types.OTHER)
                .update();
        saveAuthors(id, fields.authorIds());
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the work since {@code expectedVersion} was read. */
    @Transactional
    Work update(UUID ownerId, UUID id, int expectedVersion, WorkInput input) {
        Fields fields = validate(input);
        checkLinks(ownerId, fields);
        int changed = jdbc.sql("""
                        UPDATE works SET title_ar = :titleAr, title_en = :titleEn, science_id = :scienceId,
                               version = version + 1, updated_at = now()
                        WHERE id = :id AND owner_id = :owner AND version = :version
                        """)
                .param("titleAr", fields.titleAr(), Types.VARCHAR)
                .param("titleEn", fields.titleEn(), Types.VARCHAR)
                .param("scienceId", fields.scienceId(), Types.OTHER)
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
        jdbc.sql("DELETE FROM work_authors WHERE work_id = :id").param("id", id).update();
        saveAuthors(id, fields.authorIds());
        return get(ownerId, id);
    }

    /** Deletes the work and its editions (the web page asks the user to confirm). */
    @Transactional
    void delete(UUID ownerId, UUID id) {
        int deleted = jdbc.sql("DELETE FROM works WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
        if (deleted == 0) {
            throw new NotFoundException();
        }
    }

    private void saveAuthors(UUID workId, List<UUID> authorIds) {
        for (int i = 0; i < authorIds.size(); i++) {
            jdbc.sql("INSERT INTO work_authors (work_id, author_id, position) VALUES (:work, :author, :position)")
                    .param("work", workId)
                    .param("author", authorIds.get(i))
                    .param("position", i + 1)
                    .update();
        }
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    /**
     * The science and every author must be the owner's own; another user's gives the same answer as one that
     * doesn't exist. Called inside the transaction that saves the work, so they can't be deleted before it ends.
     */
    private void checkLinks(UUID ownerId, Fields fields) {
        if (fields.scienceId() != null && !sciences.usableBy(ownerId, fields.scienceId())) {
            throw new FieldValidationException("scienceId", "unknown_science");
        }
        for (UUID authorId : fields.authorIds()) {
            if (!authors.usableBy(ownerId, authorId)) {
                throw new FieldValidationException("authorIds", "unknown_author");
            }
        }
    }

    private static Fields validate(WorkInput input) {
        String titleAr = TextInput.line("titleAr", input.titleAr(), MAX_TITLE);
        String titleEn = TextInput.line("titleEn", input.titleEn(), MAX_TITLE);
        if (titleAr == null && titleEn == null) {
            throw new FieldValidationException("titleAr", "title_required");
        }
        return new Fields(titleAr, titleEn, input.scienceId(), authorIds(input.authorIds()));
    }

    /** In the order given; an author named twice is kept once. */
    private static List<UUID> authorIds(List<UUID> values) {
        if (values == null) {
            return List.of();
        }
        if (values.size() > MAX_AUTHORS_PER_WORK) {
            throw new FieldValidationException("authorIds", "too_many");
        }
        if (values.contains(null)) {
            throw new FieldValidationException("authorIds", "invalid");
        }
        return List.copyOf(new LinkedHashSet<>(values));
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static Row row(ResultSet rs, int rowNum) throws SQLException {
        UUID scienceId = rs.getObject("science_id", UUID.class);
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getString("title_ar"),
                rs.getString("title_en"),
                scienceId == null
                        ? null
                        : new ScienceName(scienceId, rs.getString("science_ar"), rs.getString("science_en")),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }
}
