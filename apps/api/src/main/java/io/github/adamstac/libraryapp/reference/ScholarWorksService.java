package io.github.adamstac.libraryapp.reference;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Searches the scholars' works loaded from Wikidata (V19). */
@Service
class ScholarWorksService implements ScholarWorks {

    /**
     * How alike a typed title must be to a stored one, by trigrams, to count as a typo or variant spelling rather than
     * another book: 0 is nothing in common, 1 the same.
     */
    static final double ALIKE = 0.5;

    private record Found(String id, String titleAr, String titleEn) {}

    private final JdbcClient jdbc;

    ScholarWorksService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<DatedScholar> dated() {
        return jdbc.sql("""
                        SELECT s.id, s.name_ar, s.name_en, s.death_year_hijri, s.death_year_ce,
                               (SELECT count(*) FROM reference_work_authors wa WHERE wa.scholar_id = s.id) AS works
                        FROM reference_scholars s
                        WHERE s.death_year_hijri IS NOT NULL OR s.death_year_ce IS NOT NULL
                        ORDER BY s.id""")
                .query((rs, row) -> new DatedScholar(
                        rs.getString("id"),
                        rs.getString("name_ar"),
                        rs.getString("name_en"),
                        rs.getObject("death_year_hijri", Integer.class),
                        rs.getObject("death_year_ce", Integer.class),
                        rs.getInt("works")))
                .list();
    }

    @Override
    public List<Work> byScholar(String scholarId, int limit) {
        List<Found> found = jdbc.sql("""
                        SELECT id, title_ar, title_en FROM (
                            SELECT DISTINCT ON (w.title_ar) w.id, w.title_ar, w.title_en
                            FROM reference_work_authors wa JOIN reference_works w ON w.id = wa.work_id
                            WHERE wa.scholar_id = :scholar
                            ORDER BY w.title_ar, char_length(w.id), w.id
                        ) works
                        ORDER BY char_length(id), id
                        LIMIT :limit""")
                .param("scholar", scholarId)
                .param("limit", limit)
                .query((rs, row) -> new Found(rs.getString("id"), rs.getString("title_ar"), rs.getString("title_en")))
                .list();
        return withAuthors(found);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Work> search(String text, int limit) {
        // For this transaction only: how alike counts as a match (for the <% operator), and use the trigram index.
        // Postgres underestimates what the trigram test costs per row and would otherwise read all ~30,000 works
        // (about 450 ms, against 5 ms through the index)
        jdbc.sql("SELECT set_config('pg_trgm.word_similarity_threshold', :alike, true),"
                        + " set_config('enable_seqscan', 'off', true)")
                .param("alike", Double.toString(ALIKE))
                .query()
                .singleRow();
        List<Found> found = jdbc.sql("""
                        SELECT w.id, w.title_ar, w.title_en FROM reference_works w
                        WHERE w.search_key LIKE library_like_pattern(:text)
                           OR library_search_key(:text) <% w.search_key
                        ORDER BY (w.search_key LIKE library_like_pattern(:text)) DESC,
                                 word_similarity(library_search_key(:text), w.search_key) DESC,
                                 char_length(w.title_ar), w.sort_key, w.id
                        LIMIT :limit""")
                .param("text", text)
                .param("limit", limit)
                .query((rs, row) -> new Found(rs.getString("id"), rs.getString("title_ar"), rs.getString("title_en")))
                .list();
        return withAuthors(found);
    }

    /** The works with their authors, in the order the books name them. */
    private List<Work> withAuthors(List<Found> found) {
        if (found.isEmpty()) {
            return List.of();
        }
        Map<String, List<Scholar>> authors = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT wa.work_id, s.id, s.name_ar, s.name_en, s.death_year_hijri, s.death_year_ce
                        FROM reference_work_authors wa JOIN reference_scholars s ON s.id = wa.scholar_id
                        WHERE wa.work_id IN (:ids) ORDER BY wa.work_id, wa.position""")
                .param("ids", found.stream().map(Found::id).toList())
                .query(rs -> {
                    authors.computeIfAbsent(rs.getString("work_id"), id -> new ArrayList<>()).add(new Scholar(
                            rs.getString("id"),
                            rs.getString("name_ar"),
                            rs.getString("name_en"),
                            rs.getObject("death_year_hijri", Integer.class),
                            rs.getObject("death_year_ce", Integer.class)));
                });
        return found.stream()
                .map(work -> new Work(work.id(), work.titleAr(), work.titleEn(), authors.getOrDefault(work.id(), List.of())))
                .toList();
    }
}
