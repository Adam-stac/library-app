package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.library.BenefitController.BenefitInput;
import io.github.adamstac.libraryapp.library.WorkService.WorkSummary;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Benefits (فوائد, ADR 0007): text the owner keeps from their reading, optionally naming one of their editions and
 * a volume and page in it. Where a benefit came from (the app now, the Ḥāsib bot later) is decided by the code
 * that receives it, never by the request. Every query includes the owner's ID, so someone else's benefit is "not
 * found", exactly like one that doesn't exist.
 */
@Service
class BenefitService {

    static final int MAX_BENEFITS_PER_ACCOUNT = 20_000;
    static final int MAX_TEXT = 5_000;

    /** Where a benefit arrived from. */
    enum Source {
        APP("app"),
        HASIB("hasib");

        private final String code;

        Source(String code) {
            this.code = code;
        }
    }

    /** The edition a benefit names, with its work. */
    public record EditionReference(UUID id, String title, Integer volumes, WorkSummary work) {}

    /**
     * {@code edition} is null when none was named, or when the edition has since been deleted; the volume and page
     * are kept even then, as a note of where the benefit came from.
     */
    public record Benefit(
            UUID id,
            String text,
            EditionReference edition,
            Integer volume,
            Integer page,
            String source,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    public record Page(List<Benefit> items, int page, int size, long total) {}

    private record Fields(String text, UUID editionId, Integer volume, Integer page) {}

    /** A row of the benefits table with its edition's columns, before the work's summary is added. */
    private record Row(Benefit benefit, UUID editionId, String editionTitle, Integer editionVolumes, UUID workId) {}

    private static final String SELECT = """
            SELECT b.id, b.body, b.edition_id, b.volume, b.page, b.source, b.version, b.created_at, b.updated_at,
                   e.title AS edition_title, e.volumes AS edition_volumes, e.work_id
            FROM benefits b LEFT JOIN editions e ON e.id = b.edition_id
            """;

    private final JdbcClient jdbc;
    private final WorkService works;

    BenefitService(JdbcClient jdbc, WorkService works) {
        this.jdbc = jdbc;
        this.works = works;
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /** The owner's benefits, newest first, optionally only those from one edition. */
    Page list(UUID ownerId, UUID editionId, int page, int size) {
        // Built only from fixed strings in this method, never from user input; the values are parameters
        String where = "b.owner_id = :owner" + (editionId == null ? "" : " AND b.edition_id = :edition");
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*) FROM benefits b WHERE " + where)
                .param("owner", ownerId);
        JdbcClient.StatementSpec select = jdbc.sql(SELECT + " WHERE " + where
                        + " ORDER BY b.created_at DESC, b.id LIMIT :limit OFFSET :offset")
                .param("owner", ownerId)
                .param("limit", size)
                .param("offset", (long) page * size);
        if (editionId != null) {
            count = count.param("edition", editionId);
            select = select.param("edition", editionId);
        }
        long total = count.query(Long.class).single();
        return new Page(withEditions(ownerId, select.query(BenefitService::row).list()), page, size, total);
    }

    Benefit get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Benefit> find(UUID ownerId, UUID id) {
        List<Row> rows = jdbc.sql(SELECT + " WHERE b.id = :id AND b.owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .query(BenefitService::row)
                .list();
        return withEditions(ownerId, rows).stream().findFirst();
    }

    private List<Benefit> withEditions(UUID ownerId, List<Row> rows) {
        Map<UUID, WorkSummary> summaries = works.summaries(
                ownerId, rows.stream().map(Row::workId).filter(java.util.Objects::nonNull).distinct().toList());
        return rows.stream()
                .map(row -> {
                    Benefit b = row.benefit();
                    EditionReference edition = row.editionId() == null
                            ? null
                            : new EditionReference(
                                    row.editionId(), row.editionTitle(), row.editionVolumes(), summaries.get(row.workId()));
                    return new Benefit(b.id(), b.text(), edition, b.volume(), b.page(), b.source(), b.version(),
                            b.createdAt(), b.updatedAt());
                })
                .toList();
    }

    // ---- Changing ----------------------------------------------------------------------------------------------

    @Transactional
    Benefit create(UUID ownerId, Source source, BenefitInput input) {
        Fields fields = validate(ownerId, input);
        // One add at a time per account, so two requests at once can't both squeeze under the limit
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "benefits:" + ownerId)
                .query()
                .listOfRows();
        long count = jdbc.sql("SELECT count(*) FROM benefits WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_BENEFITS_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO benefits (id, owner_id, body, edition_id, volume, page, source)
                        VALUES (:id, :owner, :body, :edition, :volume, :page, :source)
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .param("body", fields.text())
                .param("edition", fields.editionId(), Types.OTHER)
                .param("volume", fields.volume(), Types.INTEGER)
                .param("page", fields.page(), Types.INTEGER)
                .param("source", source.code)
                .update();
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the benefit since {@code expectedVersion} was read. */
    @Transactional
    Benefit update(UUID ownerId, UUID id, int expectedVersion, BenefitInput input) {
        Fields fields = validate(ownerId, input);
        int changed = jdbc.sql("""
                        UPDATE benefits SET body = :body, edition_id = :edition, volume = :volume, page = :page,
                               version = version + 1, updated_at = now()
                        WHERE id = :id AND owner_id = :owner AND version = :version
                        """)
                .param("body", fields.text())
                .param("edition", fields.editionId(), Types.OTHER)
                .param("volume", fields.volume(), Types.INTEGER)
                .param("page", fields.page(), Types.INTEGER)
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
        int deleted = jdbc.sql("DELETE FROM benefits WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
        if (deleted == 0) {
            throw new NotFoundException();
        }
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    /**
     * The text is needed. A volume or page needs an edition, which must be the owner's (another user's gives the
     * same answer as one that doesn't exist); the volume must be within its volumes, and a page in a set needs its
     * volume. Called inside the saving transaction: the edition is locked so its volumes can't change meanwhile.
     */
    private Fields validate(UUID ownerId, BenefitInput input) {
        String text = TextInput.paragraphs("text", input.text(), MAX_TEXT);
        if (text == null) {
            throw new FieldValidationException("text", "required");
        }
        UUID editionId = input.editionId();
        Integer volume = input.volume();
        Integer page = input.page();
        if (editionId == null) {
            if (volume != null || page != null) {
                throw new FieldValidationException("editionId", "edition_required");
            }
            return new Fields(text, null, null, null);
        }
        Optional<Optional<Integer>> edition = jdbc.sql(
                        "SELECT volumes FROM editions WHERE id = :id AND owner_id = :owner FOR SHARE")
                .param("id", editionId)
                .param("owner", ownerId)
                .query((rs, rowNum) -> Optional.ofNullable(rs.getObject("volumes", Integer.class)))
                .optional();
        if (edition.isEmpty()) {
            throw new FieldValidationException("editionId", "unknown_edition");
        }
        Integer volumes = edition.get().orElse(null);
        if (volume != null) {
            int highest = volumes == null ? EditionService.MAX_VOLUMES : volumes;
            if (volume < 1 || volume > highest) {
                throw new FieldValidationException("volume", "invalid_number");
            }
            if (volumes != null && volumes == 1) {
                volume = null; // a single volume needs no volume number
            }
        } else if (page != null && volumes != null && volumes > 1) {
            throw new FieldValidationException("volume", "volume_required");
        }
        if (page != null && (page < 1 || page > BookmarkService.MAX_PAGE)) {
            throw new FieldValidationException("page", "invalid_number");
        }
        return new Fields(text, editionId, volume, page);
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static Row row(ResultSet rs, int rowNum) throws SQLException {
        Benefit benefit = new Benefit(
                rs.getObject("id", UUID.class),
                rs.getString("body"),
                null,
                rs.getObject("volume", Integer.class),
                rs.getObject("page", Integer.class),
                rs.getString("source"),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
        return new Row(
                benefit,
                rs.getObject("edition_id", UUID.class),
                rs.getString("edition_title"),
                rs.getObject("edition_volumes", Integer.class),
                rs.getObject("work_id", UUID.class));
    }
}
