package io.github.adamstac.libraryapp.authors;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.authors.AuthorController.AuthorInput;
import io.github.adamstac.libraryapp.authors.AuthorController.YearInput;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's authors. Every query includes the owner's ID, so one account can never see or change another's
 * authors: someone else's author is "not found", exactly like one that doesn't exist (ADR 0006).
 */
@Service
class AuthorService {

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
            String biography) {}

    private static final String COLUMNS = """
            id, name_ar, name_en, full_name, ism, kunya, laqab, nisba,
            birth_year_hijri, birth_year_ce, birth_approximate, death_year_hijri, death_year_ce, death_approximate,
            biography, version, created_at, updated_at
            """;

    private final JdbcClient jdbc;

    AuthorService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /** A page of the owner's authors, sorted by the Arabic or the English name (falling back to the other). */
    Page list(UUID ownerId, int page, int size, boolean arabicFirst) {
        long total = jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        String order = arabicFirst
                ? "lower(coalesce(name_ar, name_en)), lower(coalesce(name_en, name_ar)), id"
                : "lower(coalesce(name_en, name_ar)), lower(coalesce(name_ar, name_en)), id";
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
                .optional();
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    @Transactional
    Author create(UUID ownerId, AuthorInput input) {
        Fields fields = validate(input);
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
                                             death_year_hijri, death_year_ce, death_approximate, biography)
                        VALUES (:id, :owner, :nameAr, :nameEn, :fullName, :ism, :kunya, :laqab, :nisba,
                                :birthHijri, :birthCe, :birthApproximate,
                                :deathHijri, :deathCe, :deathApproximate, :biography)
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
        int changed = bind(jdbc.sql("""
                        UPDATE authors SET name_ar = :nameAr, name_en = :nameEn, full_name = :fullName,
                               ism = :ism, kunya = :kunya, laqab = :laqab, nisba = :nisba,
                               birth_year_hijri = :birthHijri, birth_year_ce = :birthCe,
                               birth_approximate = :birthApproximate,
                               death_year_hijri = :deathHijri, death_year_ce = :deathCe,
                               death_approximate = :deathApproximate,
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

    @Transactional
    void delete(UUID ownerId, UUID id) {
        int deleted = jdbc.sql("DELETE FROM authors WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
        if (deleted == 0) {
            throw new NotFoundException();
        }
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

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
                rs.getString("biography"),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private static Year year(ResultSet rs, String prefix) throws SQLException {
        return new Year(
                rs.getObject(prefix + "_year_hijri", Integer.class),
                rs.getObject(prefix + "_year_ce", Integer.class),
                rs.getBoolean(prefix + "_approximate"));
    }
}
