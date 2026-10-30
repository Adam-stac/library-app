package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.authors.Authors;
import io.github.adamstac.libraryapp.authors.Authors.Death;
import io.github.adamstac.libraryapp.library.WorkService.ScienceName;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * The authors timeline (Authors page, Timeline tab): every one of the owner's authors with the year they died, how
 * many of their books the owner has, a few of their works' titles, and the science most of those works are in.
 * Authors without a year of death can't be placed on the timeline, so they are listed apart. Only the owner's own
 * records are read.
 */
@Service
class TimelineService {

    /** The most work titles given for an author: enough for their card. */
    static final int TITLES = 3;

    public record Title(String titleAr, String titleEn) {}

    /**
     * An author on the timeline. The year of death is as entered: Hijri, CE or both (the web app places a CE-only
     * year by converting it). {@code books} counts copies owned; {@code works}, the distinct works naming them.
     */
    public record Entry(
            UUID id,
            String nameAr,
            String nameEn,
            Integer deathHijri,
            Integer deathCe,
            boolean approximate,
            int books,
            int works,
            List<Title> titles,
            ScienceName science) {}

    public record Undated(UUID id, String nameAr, String nameEn) {}

    public record Timeline(List<Entry> authors, List<Undated> undated) {}

    private record Counts(int works, int books) {}

    private final JdbcClient jdbc;
    private final Authors authors;

    TimelineService(JdbcClient jdbc, Authors authors) {
        this.jdbc = jdbc;
        this.authors = authors;
    }

    Timeline timeline(UUID ownerId) {
        List<Death> all = authors.deaths(ownerId);
        Map<UUID, Counts> counts = new HashMap<>();
        jdbc.sql("""
                        SELECT wa.author_id, count(DISTINCT w.id) AS works, count(e.id) AS books
                        FROM work_authors wa
                        JOIN works w ON w.id = wa.work_id
                        LEFT JOIN editions e ON e.work_id = w.id
                        WHERE w.owner_id = :owner
                        GROUP BY wa.author_id
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> counts.put(
                        rs.getObject("author_id", UUID.class), new Counts(rs.getInt("works"), rs.getInt("books"))))
                .list();
        Map<UUID, List<Title>> titles = new HashMap<>();
        jdbc.sql("""
                        SELECT wa.author_id, w.title_ar, w.title_en
                        FROM work_authors wa JOIN works w ON w.id = wa.work_id
                        WHERE w.owner_id = :owner
                        ORDER BY wa.author_id, library_sort_key(coalesce(w.title_ar, w.title_en)), w.id
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> {
                    List<Title> list = titles.computeIfAbsent(rs.getObject("author_id", UUID.class), id -> new ArrayList<>());
                    if (list.size() < TITLES) {
                        list.add(new Title(rs.getString("title_ar"), rs.getString("title_en")));
                    }
                    return null;
                })
                .list();
        Map<UUID, ScienceName> sciences = new HashMap<>();
        // The science most of their works are in; a tie goes to the science that comes first in the catalogue
        jdbc.sql("""
                        SELECT DISTINCT ON (wa.author_id) wa.author_id, s.id, s.name_ar, s.name_en
                        FROM work_authors wa
                        JOIN works w ON w.id = wa.work_id
                        JOIN sciences s ON s.id = w.science_id AND s.owner_id = w.owner_id
                        WHERE w.owner_id = :owner
                        GROUP BY wa.author_id, s.id, s.name_ar, s.name_en
                        ORDER BY wa.author_id, count(*) DESC, library_sort_key(coalesce(s.name_ar, s.name_en)), s.id
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> sciences.put(
                        rs.getObject("author_id", UUID.class),
                        new ScienceName(rs.getObject("id", UUID.class), rs.getString("name_ar"), rs.getString("name_en"))))
                .list();

        List<Entry> placed = new ArrayList<>();
        List<Undated> undated = new ArrayList<>();
        for (Death d : all) {
            if (d.hijri() == null && d.ce() == null) {
                undated.add(new Undated(d.id(), d.nameAr(), d.nameEn()));
                continue;
            }
            Counts c = counts.getOrDefault(d.id(), new Counts(0, 0));
            placed.add(new Entry(d.id(), d.nameAr(), d.nameEn(), d.hijri(), d.ce(), d.approximate(), c.books(),
                    c.works(), titles.getOrDefault(d.id(), List.of()), sciences.get(d.id())));
        }
        return new Timeline(placed, undated);
    }
}
