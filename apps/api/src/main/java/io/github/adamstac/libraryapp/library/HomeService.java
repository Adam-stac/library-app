package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.authors.Authors;
import io.github.adamstac.libraryapp.library.BenefitService.Benefit;
import io.github.adamstac.libraryapp.library.BookmarkService.PlacedBookmark;
import io.github.adamstac.libraryapp.library.WorkService.ScienceName;
import io.github.adamstac.libraryapp.library.WorkService.WorkSummary;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The home page's summary of the user's library (ADR 0007): how it divides between the sciences, what is being
 * read, what was finished and spent this year, the books bought but not started, and the latest bookmarks and
 * benefits. Only the user's own records; "this year" is the calendar year in UTC.
 */
@Service
class HomeService {

    static final int SHORT_LIST = 5;
    static final int RECENT_BENEFITS = 3;
    /** A book being read whose bookmark (or start) hasn't moved for this long is "quiet". */
    static final int QUIET_AFTER_DAYS = 90;

    public record Counts(long books, long works, long authors, long benefits, long reading) {}

    /** One currency's total; amounts are never converted between currencies. */
    public record Spent(String currency, String amount) {}

    public record ThisYear(int year, long started, long finished, List<Spent> spent) {}

    /**
     * A science's share of the books (copies owned; a set of volumes counts once). {@code science} is null for
     * books whose work has no science. The percentages add up to exactly 100.
     */
    public record Share(ScienceName science, long books, int percent) {}

    /** A book in one of the short lists. */
    public record ShelfBook(UUID id, String title, Integer volumes, LocalDate purchasedOn, LocalDate startedOn, WorkSummary work) {}

    public record Summary(
            Counts counts,
            ThisYear thisYear,
            List<Share> bySciences,
            List<ShelfBook> notStarted,
            List<ShelfBook> quiet,
            List<PlacedBookmark> recentBookmarks,
            List<Benefit> recentBenefits) {}

    private record ShareRow(ScienceName science, long books) {}

    private record BookRow(UUID id, String title, Integer volumes, LocalDate purchasedOn, LocalDate startedOn, UUID workId) {}

    private final JdbcClient jdbc;
    private final Authors authors;
    private final WorkService works;
    private final BookmarkService bookmarks;
    private final BenefitService benefits;

    HomeService(
            JdbcClient jdbc, Authors authors, WorkService works, BookmarkService bookmarks, BenefitService benefits) {
        this.jdbc = jdbc;
        this.authors = authors;
        this.works = works;
        this.bookmarks = bookmarks;
        this.benefits = benefits;
    }

    /** Read in one transaction, so the numbers agree with each other. */
    @Transactional(readOnly = true)
    Summary summary(UUID ownerId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return new Summary(
                counts(ownerId),
                thisYear(ownerId, today.getYear()),
                bySciences(ownerId),
                books(ownerId, """
                        e.started_on IS NULL
                        ORDER BY e.purchased_on NULLS LAST, e.created_at, e.id
                        """, today),
                books(ownerId, """
                        e.started_on IS NOT NULL AND e.finished_on IS NULL
                          AND coalesce(b.moved_at::date, e.started_on) < :quietBefore
                        ORDER BY coalesce(b.moved_at::date, e.started_on), e.id
                        """, today),
                bookmarks.recent(ownerId, 0, SHORT_LIST).items(),
                benefits.list(ownerId, null, 0, RECENT_BENEFITS).items());
    }

    private Counts counts(UUID ownerId) {
        long authorCount = authors.count(ownerId);
        return jdbc.sql("""
                        SELECT (SELECT count(*) FROM editions WHERE owner_id = :owner) AS books,
                               (SELECT count(*) FROM works WHERE owner_id = :owner) AS works,
                               (SELECT count(*) FROM benefits WHERE owner_id = :owner) AS benefits,
                               (SELECT count(*) FROM editions
                                WHERE owner_id = :owner AND started_on IS NOT NULL AND finished_on IS NULL) AS reading
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> new Counts(
                        rs.getLong("books"),
                        rs.getLong("works"),
                        authorCount,
                        rs.getLong("benefits"),
                        rs.getLong("reading")))
                .single();
    }

    private ThisYear thisYear(UUID ownerId, int year) {
        LocalDate from = LocalDate.of(year, 1, 1);
        LocalDate to = from.plusYears(1);
        record Started(long started, long finished) {}
        Started counts = jdbc.sql("""
                        SELECT count(*) FILTER (WHERE started_on >= :from AND started_on < :to) AS started,
                               count(*) FILTER (WHERE finished_on >= :from AND finished_on < :to) AS finished
                        FROM editions WHERE owner_id = :owner
                        """)
                .param("owner", ownerId)
                .param("from", from)
                .param("to", to)
                .query((rs, rowNum) -> new Started(rs.getLong("started"), rs.getLong("finished")))
                .single();
        List<Spent> spent = jdbc.sql("""
                        SELECT price_currency, sum(price_minor) AS total FROM editions
                        WHERE owner_id = :owner AND price_minor IS NOT NULL
                          AND purchased_on >= :from AND purchased_on < :to
                        GROUP BY price_currency ORDER BY sum(price_minor) DESC, price_currency
                        """)
                .param("owner", ownerId)
                .param("from", from)
                .param("to", to)
                .query((rs, rowNum) -> {
                    String currency = rs.getString("price_currency");
                    return new Spent(currency, Money.amount(rs.getLong("total"), currency));
                })
                .list();
        return new ThisYear(year, counts.started(), counts.finished(), spent);
    }

    /** Ranked from most books to fewest, then by name; the books with no science come last. */
    private List<Share> bySciences(UUID ownerId) {
        List<ShareRow> rows = jdbc.sql("""
                        SELECT s.id, s.name_ar, s.name_en, count(*) AS books
                        FROM editions e JOIN works w ON w.id = e.work_id LEFT JOIN sciences s ON s.id = w.science_id
                        WHERE e.owner_id = :owner
                        GROUP BY s.id, s.name_ar, s.name_en
                        ORDER BY s.id IS NULL, count(*) DESC, library_sort_key(coalesce(s.name_ar, s.name_en)), s.id
                        """)
                .param("owner", ownerId)
                .query((rs, rowNum) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new ShareRow(
                            id == null ? null : new ScienceName(id, rs.getString("name_ar"), rs.getString("name_en")),
                            rs.getLong("books"));
                })
                .list();
        int[] percents = percentages(rows.stream().mapToLong(ShareRow::books).toArray());
        List<Share> shares = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            shares.add(new Share(rows.get(i).science(), rows.get(i).books(), percents[i]));
        }
        return shares;
    }

    /**
     * Whole percentages that add up to exactly 100 (largest remainder): each share gets its rounded-down
     * percentage, and the points left over go to the shares that lost the most in rounding. Empty for no books.
     */
    static int[] percentages(long[] counts) {
        long total = 0;
        for (long count : counts) {
            total += count;
        }
        int[] percents = new int[counts.length];
        if (total == 0) {
            return percents;
        }
        long[] remainders = new long[counts.length];
        int given = 0;
        for (int i = 0; i < counts.length; i++) {
            percents[i] = (int) (counts[i] * 100 / total);
            remainders[i] = counts[i] * 100 % total;
            given += percents[i];
        }
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) {
            order.add(i);
        }
        // Largest remainder first; on a tie, the share listed first (the larger one) wins
        order.sort(Comparator.<Integer>comparingLong(i -> remainders[i]).reversed().thenComparing(i -> i));
        for (int k = 0; k < 100 - given; k++) {
            percents[order.get(k)]++;
        }
        return percents;
    }

    /** {@code condition} is one of the two fixed texts above, never user input. */
    private List<ShelfBook> books(UUID ownerId, String condition, LocalDate today) {
        List<BookRow> rows = jdbc.sql("SELECT e.id, e.title, e.volumes, e.purchased_on, e.started_on, e.work_id"
                        + " FROM editions e LEFT JOIN bookmarks b ON b.edition_id = e.id"
                        + " WHERE e.owner_id = :owner AND " + condition + " LIMIT :limit")
                .param("owner", ownerId)
                .param("quietBefore", today.minusDays(QUIET_AFTER_DAYS))
                .param("limit", SHORT_LIST)
                .query((rs, rowNum) -> new BookRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("volumes", Integer.class),
                        rs.getObject("purchased_on", LocalDate.class),
                        rs.getObject("started_on", LocalDate.class),
                        rs.getObject("work_id", UUID.class)))
                .list();
        Map<UUID, WorkSummary> summaries = works.summaries(ownerId, rows.stream().map(BookRow::workId).distinct().toList());
        return rows.stream()
                .map(row -> new ShelfBook(row.id(), row.title(), row.volumes(), row.purchasedOn(), row.startedOn(),
                        summaries.get(row.workId())))
                .toList();
    }
}
