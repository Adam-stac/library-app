package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.library.BookmarkController.BookmarkInput;
import io.github.adamstac.libraryapp.library.WorkService.WorkSummary;
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
 * Bookmarks (ADR 0007): at most one per edition, saying where the reader is now. Moving one replaces it, and the
 * newest move wins, so there is no version. Only the owner of the edition can see or move its bookmark.
 */
@Service
class BookmarkService {

    static final int MAX_PAGE = 99_999;

    /** Where the reader is: a page, and for a set of volumes, the volume. */
    public record Bookmark(Integer volume, int page, OffsetDateTime movedAt) {}

    /** One of the most recently moved bookmarks, with its edition. */
    public record PlacedBookmark(
            UUID editionId, WorkSummary work, String title, Integer volumes, Bookmark bookmark) {}

    public record Page(List<PlacedBookmark> items, int page, int size, long total) {}

    private record Row(UUID editionId, UUID workId, String title, Integer volumes, Bookmark bookmark) {}

    private final JdbcClient jdbc;
    private final WorkService works;

    BookmarkService(JdbcClient jdbc, WorkService works) {
        this.jdbc = jdbc;
        this.works = works;
    }

    Bookmark get(UUID ownerId, UUID editionId) {
        return find(ownerId, editionId).orElseThrow(NotFoundException::new);
    }

    private Optional<Bookmark> find(UUID ownerId, UUID editionId) {
        return jdbc.sql("SELECT volume, page, moved_at FROM bookmarks WHERE edition_id = :edition AND owner_id = :owner")
                .param("edition", editionId)
                .param("owner", ownerId)
                .query((rs, rowNum) -> new Bookmark(
                        rs.getObject("volume", Integer.class),
                        rs.getInt("page"),
                        rs.getObject("moved_at", OffsetDateTime.class)))
                .optional();
    }

    /** The owner's bookmarks, the most recently moved first. */
    Page recent(UUID ownerId, int page, int size) {
        long total = jdbc.sql("SELECT count(*) FROM bookmarks WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        List<Row> rows = jdbc.sql("""
                        SELECT b.edition_id, e.work_id, e.title, e.volumes, b.volume, b.page, b.moved_at
                        FROM bookmarks b JOIN editions e ON e.id = b.edition_id
                        WHERE b.owner_id = :owner
                        ORDER BY b.moved_at DESC, b.edition_id
                        LIMIT :limit OFFSET :offset
                        """)
                .param("owner", ownerId)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query((rs, rowNum) -> new Row(
                        rs.getObject("edition_id", UUID.class),
                        rs.getObject("work_id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("volumes", Integer.class),
                        new Bookmark(
                                rs.getObject("volume", Integer.class),
                                rs.getInt("page"),
                                rs.getObject("moved_at", OffsetDateTime.class))))
                .list();
        Map<UUID, WorkSummary> summaries = works.summaries(ownerId, rows.stream().map(Row::workId).distinct().toList());
        List<PlacedBookmark> items = rows.stream()
                .map(row -> new PlacedBookmark(
                        row.editionId(), summaries.get(row.workId()), row.title(), row.volumes(), row.bookmark()))
                .toList();
        return new Page(items, page, size, total);
    }

    /**
     * Puts the edition's bookmark at this place, replacing any earlier one. The volume must be within the
     * edition's number of volumes, and is needed when the edition has more than one; for a single volume it is
     * left out.
     */
    @Transactional
    Bookmark move(UUID ownerId, UUID editionId, BookmarkInput input) {
        // FOR SHARE: the edition's number of volumes can't change until this transaction ends
        Optional<Optional<Integer>> edition = jdbc.sql(
                        "SELECT volumes FROM editions WHERE id = :id AND owner_id = :owner FOR SHARE")
                .param("id", editionId)
                .param("owner", ownerId)
                .query((rs, rowNum) -> Optional.ofNullable(rs.getObject("volumes", Integer.class)))
                .optional();
        Integer volumes = edition.orElseThrow(NotFoundException::new).orElse(null);
        Integer volume = volume(input.volume(), volumes);
        int page = page(input.page());
        jdbc.sql("""
                        INSERT INTO bookmarks (edition_id, owner_id, volume, page) VALUES (:edition, :owner, :volume, :page)
                        ON CONFLICT (edition_id) DO UPDATE
                            SET volume = EXCLUDED.volume, page = EXCLUDED.page, moved_at = now()
                        """)
                .param("edition", editionId)
                .param("owner", ownerId)
                .param("volume", volume, Types.INTEGER)
                .param("page", page)
                .update();
        return get(ownerId, editionId);
    }

    /** Removes the edition's bookmark; fine if it had none. */
    @Transactional
    void remove(UUID ownerId, UUID editionId) {
        boolean ownEdition = jdbc.sql("SELECT EXISTS (SELECT 1 FROM editions WHERE id = :id AND owner_id = :owner)")
                .param("id", editionId)
                .param("owner", ownerId)
                .query(Boolean.class)
                .single();
        if (!ownEdition) {
            throw new NotFoundException();
        }
        jdbc.sql("DELETE FROM bookmarks WHERE edition_id = :edition AND owner_id = :owner")
                .param("edition", editionId)
                .param("owner", ownerId)
                .update();
    }

    private static Integer volume(Integer volume, Integer volumes) {
        if (volume == null) {
            if (volumes != null && volumes > 1) {
                throw new FieldValidationException("volume", "volume_required");
            }
            return null;
        }
        int highest = volumes == null ? EditionService.MAX_VOLUMES : volumes;
        if (volume < 1 || volume > highest) {
            throw new FieldValidationException("volume", "invalid_number");
        }
        return volumes != null && volumes == 1 ? null : volume; // a single volume needs no volume number
    }

    private static int page(Integer page) {
        if (page == null) {
            throw new FieldValidationException("page", "required");
        }
        if (page < 1 || page > MAX_PAGE) {
            throw new FieldValidationException("page", "invalid_number");
        }
        return page;
    }
}
