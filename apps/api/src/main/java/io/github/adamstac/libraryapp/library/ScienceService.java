package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.library.ScienceController.ScienceInput;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's own list of sciences (ADR 0007). A new account starts with the starter list (copied in by the database);
 * after that the list is the user's to rename, delete and add to. Every query includes the owner's ID, so someone
 * else's science is "not found", exactly like one that doesn't exist.
 */
@Service
class ScienceService {

    static final int MAX_SCIENCES_PER_ACCOUNT = 200;
    static final int MAX_NAME = 100;

    public record Science(
            UUID id, String nameAr, String nameEn, int version, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

    /** All of the account's sciences: there are at most 200, so the list isn't paged. */
    public record ScienceList(List<Science> items, int total) {}

    private record Fields(String nameAr, String nameEn) {}

    private record NamesTaken(boolean arabic, boolean english) {}

    private static final String COLUMNS = "id, name_ar, name_en, version, created_at, updated_at";

    private final JdbcClient jdbc;

    ScienceService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    ScienceList list(UUID ownerId, boolean arabicFirst) {
        String order = arabicFirst
                ? "lower(coalesce(name_ar, name_en)), lower(coalesce(name_en, name_ar)), id"
                : "lower(coalesce(name_en, name_ar)), lower(coalesce(name_ar, name_en)), id";
        List<Science> items = jdbc.sql("SELECT " + COLUMNS + " FROM sciences WHERE owner_id = :owner ORDER BY " + order)
                .param("owner", ownerId) // the order is one of two fixed strings above, never user input
                .query(ScienceService::science)
                .list();
        return new ScienceList(items, items.size());
    }

    Science get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Science> find(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM sciences WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .query(ScienceService::science)
                .optional();
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    @Transactional
    Science create(UUID ownerId, ScienceInput input) {
        Fields fields = validate(input);
        lockList(ownerId);
        long count = jdbc.sql("SELECT count(*) FROM sciences WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_SCIENCES_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID id = UUID.randomUUID();
        refuseNamesInUse(ownerId, id, fields);
        try {
            jdbc.sql("INSERT INTO sciences (id, owner_id, name_ar, name_en) VALUES (:id, :owner, :nameAr, :nameEn)")
                    .param("id", id)
                    .param("owner", ownerId)
                    .param("nameAr", fields.nameAr(), Types.VARCHAR)
                    .param("nameEn", fields.nameEn(), Types.VARCHAR)
                    .update();
        } catch (DuplicateKeyException sameName) {
            throw new ConflictException("already_used"); // the lock above means this shouldn't happen
        }
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the science since {@code expectedVersion} was read. */
    @Transactional
    Science update(UUID ownerId, UUID id, int expectedVersion, ScienceInput input) {
        Fields fields = validate(input);
        lockList(ownerId);
        if (find(ownerId, id).isEmpty()) {
            throw new NotFoundException();
        }
        refuseNamesInUse(ownerId, id, fields);
        int changed;
        try {
            changed = jdbc.sql("""
                            UPDATE sciences SET name_ar = :nameAr, name_en = :nameEn,
                                   version = version + 1, updated_at = now()
                            WHERE id = :id AND owner_id = :owner AND version = :version
                            """)
                    .param("nameAr", fields.nameAr(), Types.VARCHAR)
                    .param("nameEn", fields.nameEn(), Types.VARCHAR)
                    .param("id", id)
                    .param("owner", ownerId)
                    .param("version", expectedVersion)
                    .update();
        } catch (DuplicateKeyException sameName) {
            throw new ConflictException("already_used");
        }
        if (changed == 0) {
            throw new ConflictException("stale_version");
        }
        return get(ownerId, id);
    }

    /** Deletes one of the user's sciences, unless a work still has it (409 in_use). */
    @Transactional
    void delete(UUID ownerId, UUID id) {
        // Waits for any transaction that is giving a work this science (usableBy), so the count below includes it
        if (!lockForDeleting(ownerId, id)) {
            throw new NotFoundException();
        }
        long works = jdbc.sql("SELECT count(*) FROM works WHERE owner_id = :owner AND science_id = :id")
                .param("owner", ownerId)
                .param("id", id)
                .query(Long.class)
                .single();
        if (works > 0) {
            throw new ConflictException("in_use", Map.<String, Object>of("usedBy", Map.of("works", works)));
        }
        // The database checks the links again when the transaction commits (V12)
        jdbc.sql("DELETE FROM sciences WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
    }

    /**
     * Whether the science is one of the user's own. Called inside the transaction that gives a work this science:
     * the science is then locked against deletion until that transaction ends (many callers can hold it).
     */
    boolean usableBy(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT id FROM sciences WHERE id = :id AND owner_id = :owner FOR KEY SHARE")
                .param("id", id)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    private boolean lockForDeleting(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT id FROM sciences WHERE id = :id AND owner_id = :owner FOR UPDATE")
                .param("id", id)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    /**
     * One change to the account's list at a time, so the limit and the "no two sciences with the same name" rule
     * hold even for requests sent at the same moment (held until the transaction ends).
     */
    private void lockList(UUID ownerId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "sciences:" + ownerId)
                .query()
                .listOfRows();
    }

    /** Two of the account's sciences can't share a name: the Arabic exactly, the English ignoring case. */
    private void refuseNamesInUse(UUID ownerId, UUID id, Fields fields) {
        NamesTaken taken = jdbc.sql("""
                        SELECT coalesce(bool_or(name_ar = :nameAr), false) AS arabic,
                               coalesce(bool_or(lower(name_en) = lower(:nameEn)), false) AS english
                        FROM sciences WHERE owner_id = :owner AND id <> :id
                        """)
                .param("nameAr", fields.nameAr(), Types.VARCHAR)
                .param("nameEn", fields.nameEn(), Types.VARCHAR)
                .param("owner", ownerId)
                .param("id", id)
                .query((rs, rowNum) -> new NamesTaken(rs.getBoolean("arabic"), rs.getBoolean("english")))
                .single();
        if (taken.arabic()) {
            throw new FieldValidationException("nameAr", "already_used");
        }
        if (taken.english()) {
            throw new FieldValidationException("nameEn", "already_used");
        }
    }

    private static Fields validate(ScienceInput input) {
        String nameAr = TextInput.line("nameAr", input.nameAr(), MAX_NAME);
        String nameEn = TextInput.line("nameEn", input.nameEn(), MAX_NAME);
        if (nameAr == null && nameEn == null) {
            throw new FieldValidationException("nameAr", "name_required");
        }
        return new Fields(nameAr, nameEn);
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static Science science(ResultSet rs, int rowNum) throws SQLException {
        return new Science(
                rs.getObject("id", UUID.class),
                rs.getString("name_ar"),
                rs.getString("name_en"),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }
}
