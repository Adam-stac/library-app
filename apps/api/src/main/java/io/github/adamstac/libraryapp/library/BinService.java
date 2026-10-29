package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.authors.Authors;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The bin (ADR 0009): a deleted book or benefit is kept for {@value #KEPT_DAYS} days, so it can be put back as it
 * was, and is then deleted for good. Deleting moves the record's row here (as JSON) and takes it out of its table,
 * so nothing else in the app sees it. Every query includes the owner's ID, so someone else's item is "not found",
 * exactly like one that doesn't exist. The JSON is only ever written by this class, from the database's own rows.
 *
 * <p>Putting back lists every column of editions, works and benefits: a column added to one of those tables must be
 * added here too, or it comes back empty.
 */
@Service
class BinService {

    static final int KEPT_DAYS = 30;
    /** The most kept per account: past this, the oldest go first, so the bin can't grow without end. */
    static final int MAX_ITEMS = 20_000;
    /** The most the bin page shows; there are rarely more than a handful. */
    static final int LIST_LIMIT = 200;
    static final int EXCERPT = 200;

    private static final Logger log = LoggerFactory.getLogger(BinService.class);

    /** Still in the bin: not yet past its 30 days, even if the daily clear-out hasn't run yet. */
    private static final String KEPT = "b.deleted_at > now() - make_interval(days => " + KEPT_DAYS + ")";

    /**
     * One item in the bin. A book has its title (its own, or its work's); a benefit has the start of its text.
     * {@code removedAt} is when it will be deleted for good.
     */
    public record Item(
            UUID id,
            String kind,
            String title,
            String titleAr,
            String titleEn,
            String excerpt,
            OffsetDateTime deletedAt,
            OffsetDateTime removedAt) {}

    public record Contents(List<Item> items, long total, int keptDays) {}

    /** What was put back, so the app can open it. */
    public record Restored(UUID id, String kind) {}

    private final JdbcClient jdbc;
    private final Authors authors;

    BinService(JdbcClient jdbc, Authors authors) {
        this.jdbc = jdbc;
        this.authors = authors;
    }

    // ---- Moving into the bin (called inside the deleting transaction) ------------------------------------------

    /**
     * Moves an edition to the bin with its bookmark, noting which benefits named it (they stay, without the link,
     * until it is put back). With {@code withWorkIfLast}, a work left with no copies goes too, kept with this book.
     */
    void moveBook(UUID ownerId, UUID editionId, boolean withWorkIfLast) {
        UUID workId = jdbc.sql("SELECT work_id FROM editions WHERE id = :id AND owner_id = :owner FOR UPDATE")
                .param("id", editionId)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .orElseThrow(NotFoundException::new);
        jdbc.sql("""
                        INSERT INTO bin (id, owner_id, kind, record, related)
                        SELECT e.id, e.owner_id, 'book', to_jsonb(e) - 'search_key',
                               jsonb_strip_nulls(jsonb_build_object(
                                   'bookmark', (SELECT to_jsonb(m) FROM bookmarks m WHERE m.edition_id = e.id),
                                   'benefitIds', (SELECT jsonb_agg(x.id) FROM benefits x
                                                  WHERE x.edition_id = e.id AND x.owner_id = e.owner_id)))
                        FROM editions e WHERE e.id = :id AND e.owner_id = :owner
                        """ + REPLACE_IF_THERE)
                .param("id", editionId)
                .param("owner", ownerId)
                .update();
        jdbc.sql("DELETE FROM editions WHERE id = :id AND owner_id = :owner")
                .param("id", editionId)
                .param("owner", ownerId)
                .update();
        if (withWorkIfLast) {
            // Locked first, so a copy can't be added to the work while this decides it has none
            jdbc.sql("SELECT id FROM works WHERE id = :work AND owner_id = :owner FOR UPDATE")
                    .param("work", workId)
                    .param("owner", ownerId)
                    .query(UUID.class)
                    .optional();
            boolean last = jdbc.sql("SELECT NOT EXISTS (SELECT 1 FROM editions WHERE work_id = :work)")
                    .param("work", workId)
                    .query(Boolean.class)
                    .single();
            if (last) {
                jdbc.sql("""
                                UPDATE bin SET related = related || jsonb_build_object(
                                    'work', (SELECT to_jsonb(w) - 'search_key' FROM works w
                                             WHERE w.id = :work AND w.owner_id = :owner),
                                    'workAuthors', (SELECT coalesce(jsonb_agg(author_id ORDER BY position), '[]')
                                                    FROM work_authors WHERE work_id = :work))
                                WHERE id = :id AND owner_id = :owner
                                """)
                        .param("work", workId)
                        .param("id", editionId)
                        .param("owner", ownerId)
                        .update();
                jdbc.sql("DELETE FROM works WHERE id = :work AND owner_id = :owner")
                        .param("work", workId)
                        .param("owner", ownerId)
                        .update();
            }
        }
        keepWithinLimit(ownerId);
    }

    /** Moves a benefit to the bin. */
    void moveBenefit(UUID ownerId, UUID benefitId) {
        int moved = jdbc.sql("""
                        INSERT INTO bin (id, owner_id, kind, record)
                        SELECT x.id, x.owner_id, 'benefit', to_jsonb(x) - 'search_key'
                        FROM benefits x WHERE x.id = :id AND x.owner_id = :owner
                        """ + REPLACE_IF_THERE)
                .param("id", benefitId)
                .param("owner", ownerId)
                .update();
        if (moved == 0) {
            throw new NotFoundException();
        }
        jdbc.sql("DELETE FROM benefits WHERE id = :id AND owner_id = :owner")
                .param("id", benefitId)
                .param("owner", ownerId)
                .update();
        keepWithinLimit(ownerId);
    }

    /** A record put back and deleted again replaces its old copy in the bin. */
    private static final String REPLACE_IF_THERE = """
            ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, record = EXCLUDED.record,
                                           related = EXCLUDED.related, deleted_at = now()
            WHERE bin.owner_id = EXCLUDED.owner_id
            """;

    private void keepWithinLimit(UUID ownerId) {
        jdbc.sql("""
                        DELETE FROM bin WHERE id IN (SELECT id FROM bin WHERE owner_id = :owner
                                                     ORDER BY deleted_at DESC, id OFFSET :max)
                        """)
                .param("owner", ownerId)
                .param("max", MAX_ITEMS)
                .update();
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /** What is in the owner's bin, most recently deleted first. */
    Contents list(UUID ownerId) {
        long total = jdbc.sql("SELECT count(*) FROM bin b WHERE b.owner_id = :owner AND " + KEPT)
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        List<Item> items = jdbc.sql("""
                        SELECT b.id, b.kind, b.record ->> 'title' AS title,
                               coalesce(w.title_ar, b.related -> 'work' ->> 'title_ar') AS title_ar,
                               coalesce(w.title_en, b.related -> 'work' ->> 'title_en') AS title_en,
                               left(b.record ->> 'body', :excerpt) AS excerpt,
                               b.deleted_at, b.deleted_at + make_interval(days => :days) AS removed_at
                        FROM bin b
                        LEFT JOIN works w ON b.kind = 'book' AND w.id = (b.record ->> 'work_id')::uuid
                                         AND w.owner_id = b.owner_id
                        WHERE b.owner_id = :owner AND %s
                        ORDER BY b.deleted_at DESC, b.id
                        LIMIT :limit
                        """.formatted(KEPT))
                .param("owner", ownerId)
                .param("excerpt", EXCERPT)
                .param("days", KEPT_DAYS)
                .param("limit", LIST_LIMIT)
                .query((rs, rowNum) -> new Item(
                        rs.getObject("id", UUID.class),
                        rs.getString("kind"),
                        rs.getString("title"),
                        rs.getString("title_ar"),
                        rs.getString("title_en"),
                        rs.getString("excerpt"),
                        rs.getObject("deleted_at", OffsetDateTime.class),
                        rs.getObject("removed_at", OffsetDateTime.class)))
                .list();
        return new Contents(items, total, KEPT_DAYS);
    }

    // ---- Putting back ------------------------------------------------------------------------------------------

    /**
     * Puts the item back as it was: a book with its bookmark, its links to the benefits that named it, and its
     * work if that went with it; a benefit with its link to its book, if the book is still there and still has
     * the volume. Links to a science or author deleted meanwhile are left out. The usual limits still apply.
     */
    @Transactional
    Restored restore(UUID ownerId, UUID id) {
        String kind = jdbc.sql("SELECT b.kind FROM bin b WHERE b.id = :id AND b.owner_id = :owner AND " + KEPT
                        + " FOR UPDATE")
                .param("id", id)
                .param("owner", ownerId)
                .query(String.class)
                .optional()
                .orElseThrow(NotFoundException::new);
        if (kind.equals("book")) {
            restoreBook(ownerId, id);
        } else {
            restoreBenefit(ownerId, id);
        }
        jdbc.sql("DELETE FROM bin WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", ownerId)
                .update();
        return new Restored(id, kind);
    }

    private void restoreBook(UUID ownerId, UUID id) {
        underLimit(ownerId, "editions", EditionService.MAX_EDITIONS_PER_ACCOUNT);
        UUID workId = jdbc.sql("SELECT (record ->> 'work_id')::uuid FROM bin WHERE id = :id")
                .param("id", id)
                .query(UUID.class)
                .single();
        boolean workThere = jdbc.sql("SELECT id FROM works WHERE id = :work AND owner_id = :owner FOR KEY SHARE")
                .param("work", workId)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
        if (!workThere) {
            restoreWork(ownerId, workId);
        }
        jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id, title, language, translator, muhaqqiq, publisher,
                                              publication_place, published_hijri, published_ce, edition_number,
                                              volumes, isbn, legal_deposit, shelf, notes, purchased_on, price_minor,
                                              price_currency, started_on, finished_on, version, created_at, updated_at)
                        SELECT r.id, :owner, :work, r.title, r.language, r.translator, r.muhaqqiq, r.publisher,
                               r.publication_place, r.published_hijri, r.published_ce, r.edition_number, r.volumes,
                               r.isbn, r.legal_deposit, r.shelf, r.notes, r.purchased_on, r.price_minor,
                               r.price_currency, r.started_on, r.finished_on, r.version, r.created_at, r.updated_at
                        FROM bin, jsonb_populate_record(NULL::editions, bin.record) r
                        WHERE bin.id = :id AND bin.owner_id = :owner
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .param("work", workId)
                .update();
        jdbc.sql("""
                        INSERT INTO bookmarks (edition_id, owner_id, volume, page, moved_at)
                        SELECT :id, :owner, r.volume, r.page, r.moved_at
                        FROM bin, jsonb_populate_record(NULL::bookmarks, bin.related -> 'bookmark') r
                        WHERE bin.id = :id AND bin.owner_id = :owner AND bin.related -> 'bookmark' IS NOT NULL
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .update();
        // Only benefits still without a book: one linked to another book meanwhile stays where it was put
        jdbc.sql("""
                        UPDATE benefits SET edition_id = :id
                        WHERE owner_id = :owner AND edition_id IS NULL
                          AND id IN (SELECT x::uuid
                                     FROM bin, jsonb_array_elements_text(coalesce(bin.related -> 'benefitIds', '[]')) x
                                     WHERE bin.id = :id AND bin.owner_id = :owner)
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .update();
    }

    /**
     * The work went to the bin with this book, or with another copy of it that is also in the bin (the last one
     * deleted). If neither has it, the work was deleted for good, and the book can't be put back without it.
     */
    private void restoreWork(UUID ownerId, UUID workId) {
        UUID keptWith = jdbc.sql("""
                        SELECT id FROM bin
                        WHERE owner_id = :owner AND kind = 'book' AND related -> 'work' ->> 'id' = :work
                        ORDER BY deleted_at DESC LIMIT 1
                        """)
                .param("owner", ownerId)
                .param("work", workId.toString())
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> new ConflictException("work_gone"));
        underLimit(ownerId, "works", WorkService.MAX_WORKS_PER_ACCOUNT);
        jdbc.sql("""
                        INSERT INTO works (id, owner_id, title_ar, title_en, science_id, version, created_at, updated_at)
                        SELECT r.id, :owner, r.title_ar, r.title_en,
                               (SELECT s.id FROM sciences s WHERE s.id = r.science_id AND s.owner_id = :owner
                                FOR KEY SHARE),
                               r.version, r.created_at, r.updated_at
                        FROM bin, jsonb_populate_record(NULL::works, bin.related -> 'work') r
                        WHERE bin.id = :kept AND bin.owner_id = :owner
                        """)
                .param("kept", keptWith)
                .param("owner", ownerId)
                .update();
        List<UUID> authorIds = jdbc.sql("""
                        SELECT a.value::uuid FROM bin,
                               jsonb_array_elements_text(coalesce(bin.related -> 'workAuthors', '[]'))
                                   WITH ORDINALITY AS a (value, n)
                        WHERE bin.id = :kept AND bin.owner_id = :owner
                        ORDER BY a.n
                        """)
                .param("kept", keptWith)
                .param("owner", ownerId)
                .query(UUID.class)
                .list();
        int position = 0;
        for (UUID authorId : authorIds) {
            if (position < WorkService.MAX_AUTHORS_PER_WORK && authors.usableBy(ownerId, authorId)) {
                position++;
                jdbc.sql("INSERT INTO work_authors (work_id, author_id, position) VALUES (:work, :author, :position)")
                        .param("work", workId)
                        .param("author", authorId)
                        .param("position", position)
                        .update();
            }
        }
    }

    private void restoreBenefit(UUID ownerId, UUID id) {
        underLimit(ownerId, "benefits", BenefitService.MAX_BENEFITS_PER_ACCOUNT);
        jdbc.sql("""
                        INSERT INTO benefits (id, owner_id, body, edition_id, volume, page, source, version,
                                              created_at, updated_at)
                        SELECT r.id, :owner, r.body,
                               (SELECT e.id FROM editions e
                                WHERE e.id = r.edition_id AND e.owner_id = :owner
                                  AND (r.volume IS NULL OR e.volumes IS NULL OR r.volume <= e.volumes)
                                FOR SHARE),
                               r.volume, r.page, r.source, r.version, r.created_at, r.updated_at
                        FROM bin, jsonb_populate_record(NULL::benefits, bin.record) r
                        WHERE bin.id = :id AND bin.owner_id = :owner
                        """)
                .param("id", id)
                .param("owner", ownerId)
                .update();
    }

    /** The same lock and count as adding one, so putting back can't pass a limit that adding couldn't. */
    private void underLimit(UUID ownerId, String table, int max) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", table + ":" + ownerId)
                .query()
                .listOfRows();
        // The table name is one of three fixed strings from this class, never user input
        long count = jdbc.sql("SELECT count(*) FROM " + table + " WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= max) {
            throw new ConflictException("limit_reached");
        }
    }

    // ---- Deleting for good -------------------------------------------------------------------------------------

    @Transactional
    void delete(UUID ownerId, UUID id) {
        int deleted = jdbc.sql("DELETE FROM bin b WHERE b.id = :id AND b.owner_id = :owner AND " + KEPT)
                .param("id", id)
                .param("owner", ownerId)
                .update();
        if (deleted == 0) {
            throw new NotFoundException();
        }
    }

    @Transactional
    void empty(UUID ownerId) {
        jdbc.sql("DELETE FROM bin WHERE owner_id = :owner").param("owner", ownerId).update();
    }

    @Scheduled(cron = "0 41 3 * * *") // every day, at 03:41
    void runDaily() {
        deleteExpired();
    }

    /** Data minimisation (GDPR): what has been in the bin for its 30 days is deleted for good. */
    int deleteExpired() {
        int deleted = jdbc.sql("DELETE FROM bin b WHERE NOT (" + KEPT + ")").update();
        if (deleted > 0) {
            log.info("Deleted {} items kept in the bin past {} days", deleted, KEPT_DAYS);
        }
        return deleted;
    }
}
