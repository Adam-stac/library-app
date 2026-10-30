package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.reference.IsbnRanges;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Suggestions for a new copy's details from its ISBN (ADR 0010, layer 1, slice L2), drawn only from the reader's own
 * books and from the ISBN itself; nothing is looked up anywhere else and nothing is saved. The publisher and place come
 * from the reader's other books with the same publisher's code (which needs the imported ISBN ranges); the language
 * from those books, or else from the ISBN's country or language code. The web app fills only empty fields, and marks
 * each one "may be incorrect, please check" until it is edited.
 */
@Service
class EditionSuggestionService {

    /** Where a suggestion came from, so the web app can say so beside the field. */
    enum From {
        yourBooks,
        country,
        languageArea,
        /** An Arabic publisher whose ISBNs come from another country's code (IsbnAreas); the country is theirs */
        publisher
    }

    /**
     * One suggested value. {@code country} is the ISBN's country (ISO 3166) when the value came from it, or the
     * publisher's when it came from an Arabic publisher's own code, so the note can name it; otherwise null.
     */
    public record Suggested(String value, From from, String country) {}

    /** What can be suggested for a copy with this ISBN; a field with nothing to suggest is null. */
    public record Suggestions(Suggested publisher, Suggested publicationPlace, Suggested language) {}

    /** Enough of the reader's books to see which publisher name they use; more adds nothing. */
    static final int MAX_BOOKS = 200;

    private record Known(String publisher, String place, String language) {}

    private final JdbcClient jdbc;
    private final IsbnRanges ranges;

    EditionSuggestionService(JdbcClient jdbc, IsbnRanges ranges) {
        this.jdbc = jdbc;
        this.ranges = ranges;
    }

    /**
     * @param excludeId the copy being edited, which mustn't suggest its own details back
     * @throws FieldValidationException when the ISBN is missing or not a real ISBN (never echoing it)
     */
    Suggestions suggest(UUID ownerId, String isbnText, UUID excludeId) {
        String isbn = PrintedNumbers.isbn(isbnText);
        if (isbn == null) {
            throw new FieldValidationException("isbn", "required");
        }
        String isbn13 = PrintedNumbers.isbn13(isbn);

        Suggested publisher = null;
        Suggested place = null;
        Suggested language = null;
        Optional<String> prefix = ranges.publisherPrefix(isbn13);
        if (prefix.isPresent()) {
            List<Known> known = booksFromPublisher(ownerId, prefix.get(), excludeId);
            String publisherName = mostCommon(known, Known::publisher);
            // The place where that publisher's books were printed; a publisher with offices in two cities is told
            // apart by the reader's own entries
            List<Known> samePublisher = publisherName == null
                    ? known
                    : known.stream().filter(book -> publisherName.equals(book.publisher())).toList();
            String placeName = mostCommon(samePublisher, Known::place);
            String languageCode = mostCommon(known, Known::language);
            publisher = yours(publisherName);
            place = yours(placeName);
            language = yours(languageCode);
        }
        if (language == null) {
            language = IsbnAreas.of(isbn13)
                    .map(area -> new Suggested(
                            area.language(),
                            area.publisher() ? From.publisher : area.country() == null ? From.languageArea : From.country,
                            area.country()))
                    .orElse(null);
        }
        return new Suggestions(publisher, place, language);
    }

    /** The reader's own copies whose ISBN, in either form, starts with this publisher's code; newest change first. */
    private List<Known> booksFromPublisher(UUID ownerId, String prefix13, UUID excludeId) {
        // The prefix is digits only (it comes from a checked ISBN), so it holds no LIKE wildcards
        String sql = "SELECT e.publisher, e.publication_place, e.language FROM editions e"
                + " WHERE e.owner_id = :owner AND ((char_length(e.isbn) = 13 AND e.isbn LIKE :isbn13)"
                + (prefix13.startsWith("978") ? " OR (char_length(e.isbn) = 10 AND e.isbn LIKE :isbn10)" : "")
                + ")"
                + (excludeId == null ? "" : " AND e.id <> :exclude")
                + " ORDER BY e.updated_at DESC, e.id LIMIT :limit";
        JdbcClient.StatementSpec select = jdbc.sql(sql)
                .param("owner", ownerId)
                .param("isbn13", prefix13 + "%")
                .param("limit", MAX_BOOKS);
        if (prefix13.startsWith("978")) {
            // An ISBN-10 is its ISBN-13 without 978 and with its own check digit, so its publisher's code is the same
            select = select.param("isbn10", prefix13.substring(3) + "%");
        }
        if (excludeId != null) {
            select = select.param("exclude", excludeId);
        }
        return select.query((rs, row) -> new Known(
                        rs.getString("publisher"), rs.getString("publication_place"), rs.getString("language")))
                .list();
    }

    /** The value most of these books have, ignoring blanks; on a tie, the most recently changed book's. */
    static <T> String mostCommon(List<T> books, Function<T, String> field) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (T book : books) {
            String value = field.apply(book);
            if (value != null) {
                counts.merge(value, 1, Integer::sum);
            }
        }
        String best = null;
        int bestCount = 0;
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            if (entry.getValue() > bestCount) {
                best = entry.getKey();
                bestCount = entry.getValue();
            }
        }
        return best;
    }

    private static Suggested yours(String value) {
        return value == null ? null : new Suggested(value, From.yourBooks, null);
    }
}
