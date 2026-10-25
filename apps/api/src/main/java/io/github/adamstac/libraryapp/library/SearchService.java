package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.authors.Authors;
import io.github.adamstac.libraryapp.library.WorkService.WorkSummary;
import io.github.adamstac.libraryapp.places.Places;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * One search across the user's library (ADR 0006): authors, places, works, editions and benefits, matched the
 * Arabic-aware way (V16), so مغني finds المُغْنِي and hadith finds Ḥadīth. The search text is matched literally,
 * and only the user's own records are searched (plus the shared list of places). Authors and places are searched
 * by their own modules.
 */
@Service
class SearchService {

    static final int BENEFIT_EXCERPT = 300;

    /** The first few of each kind, and how many there are in all. */
    public record Found<T>(List<T> items, long total) {}

    public record EditionHit(UUID id, String title, Integer volumes, WorkSummary work) {}

    /** {@code excerpt} is the start of the benefit, at most 300 characters; {@code shortened} says if it was cut. */
    public record BenefitHit(UUID id, String excerpt, boolean shortened, UUID editionId, OffsetDateTime createdAt) {}

    public record Results(
            Found<Authors.AuthorName> authors,
            Found<Places.PlaceName> places,
            Found<WorkSummary> works,
            Found<EditionHit> editions,
            Found<BenefitHit> benefits) {}

    /** ESCAPE: library_like_pattern turns % and _ in the search text into ordinary characters. */
    private static final String MATCHES = " search_key LIKE library_like_pattern(:text) ESCAPE '\\'";

    private record EditionRow(UUID id, String title, Integer volumes, UUID workId) {}

    private final JdbcClient jdbc;
    private final Authors authors;
    private final Places places;
    private final WorkService works;

    SearchService(JdbcClient jdbc, Authors authors, Places places, WorkService works) {
        this.jdbc = jdbc;
        this.authors = authors;
        this.places = places;
        this.works = works;
    }

    Results search(UUID ownerId, String text, int limit) {
        // Something must be left to look for once vowel marks and the like are set aside ("ـَ" alone is nothing)
        String key = jdbc.sql("SELECT library_search_key(:text)").param("text", text).query(String.class).single();
        if (key.codePoints().noneMatch(Character::isLetterOrDigit)) {
            throw new FieldValidationException("q", "required");
        }
        Authors.Found foundAuthors = authors.search(ownerId, text, limit);
        Places.Found foundPlaces = places.search(ownerId, text, limit);
        return new Results(
                new Found<>(foundAuthors.items(), foundAuthors.total()),
                new Found<>(foundPlaces.items(), foundPlaces.total()),
                works(ownerId, text, limit),
                editions(ownerId, text, limit),
                benefits(ownerId, text, limit));
    }

    private Found<WorkSummary> works(UUID ownerId, String text, int limit) {
        List<UUID> ids = jdbc.sql("SELECT id FROM works WHERE owner_id = :owner AND" + MATCHES
                        + " ORDER BY library_sort_key(coalesce(title_ar, title_en)), id LIMIT :limit")
                .param("owner", ownerId)
                .param("text", text)
                .param("limit", limit)
                .query(UUID.class)
                .list();
        Map<UUID, WorkSummary> summaries = works.summaries(ownerId, ids);
        return new Found<>(ids.stream().map(summaries::get).toList(), count("works", ownerId, text));
    }

    private Found<EditionHit> editions(UUID ownerId, String text, int limit) {
        List<EditionRow> rows = jdbc.sql("SELECT e.id, e.title, e.volumes, e.work_id"
                        + " FROM editions e JOIN works w ON w.id = e.work_id"
                        + " WHERE e.owner_id = :owner AND e." + MATCHES.strip()
                        + " ORDER BY library_sort_key(coalesce(e.title, w.title_ar, w.title_en)), e.id LIMIT :limit")
                .param("owner", ownerId)
                .param("text", text)
                .param("limit", limit)
                .query((rs, rowNum) -> new EditionRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("volumes", Integer.class),
                        rs.getObject("work_id", UUID.class)))
                .list();
        Map<UUID, WorkSummary> summaries =
                works.summaries(ownerId, rows.stream().map(EditionRow::workId).distinct().toList());
        List<EditionHit> items = rows.stream()
                .map(row -> new EditionHit(row.id(), row.title(), row.volumes(), summaries.get(row.workId())))
                .toList();
        return new Found<>(items, count("editions", ownerId, text));
    }

    private Found<BenefitHit> benefits(UUID ownerId, String text, int limit) {
        List<BenefitHit> items = jdbc.sql("SELECT id, body, edition_id, created_at FROM benefits"
                        + " WHERE owner_id = :owner AND" + MATCHES + " ORDER BY created_at DESC, id LIMIT :limit")
                .param("owner", ownerId)
                .param("text", text)
                .param("limit", limit)
                .query((rs, rowNum) -> {
                    String body = rs.getString("body");
                    boolean shortened = body.codePointCount(0, body.length()) > BENEFIT_EXCERPT;
                    String excerpt = shortened ? body.substring(0, body.offsetByCodePoints(0, BENEFIT_EXCERPT)) : body;
                    return new BenefitHit(
                            rs.getObject("id", UUID.class),
                            excerpt,
                            shortened,
                            rs.getObject("edition_id", UUID.class),
                            rs.getObject("created_at", OffsetDateTime.class));
                })
                .list();
        return new Found<>(items, count("benefits", ownerId, text));
    }

    /** {@code table} is one of the fixed names above, never user input. */
    private long count(String table, UUID ownerId, String text) {
        return jdbc.sql("SELECT count(*) FROM " + table + " WHERE owner_id = :owner AND" + MATCHES)
                .param("owner", ownerId)
                .param("text", text)
                .query(Long.class)
                .single();
    }
}
