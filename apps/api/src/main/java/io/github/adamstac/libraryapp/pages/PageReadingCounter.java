package io.github.adamstac.libraryapp.pages;

import io.github.adamstac.libraryapp.LimitReachedException;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Counts readings, so that what they cost stays within the limits (ADR 0011, point 4): per account a day and a month,
 * and for the whole app a month. A reading is counted before Google is asked, so two at once can't both slip under a
 * limit. Only who asked, when and how it went is kept; rows older than two months are deleted as new ones come.
 */
@Component
class PageReadingCounter {

    /** How many are left, and whether the app as a whole is paused for the month */
    record Left(int today, int thisMonth, boolean appPaused) {}

    private final JdbcClient jdbc;
    private final int perDay;
    private final int perMonth;
    private final int appPerMonth;

    PageReadingCounter(
            JdbcClient jdbc,
            @Value("${app.page-reading.per-account-day}") int perDay,
            @Value("${app.page-reading.per-account-month}") int perMonth,
            @Value("${app.page-reading.app-month}") int appPerMonth) {
        this.jdbc = jdbc;
        this.perDay = perDay;
        this.perMonth = perMonth;
        this.appPerMonth = appPerMonth;
    }

    @Transactional(readOnly = true)
    Left left(UUID ownerId) {
        long today = count("owner_id = :owner AND read_at >= date_trunc('day', now())", ownerId);
        long month = count("owner_id = :owner AND read_at >= date_trunc('month', now())", ownerId);
        long app = count("read_at >= date_trunc('month', now())", null);
        return new Left(
                (int) Math.max(0, Math.min(perDay - today, perMonth - month)),
                (int) Math.max(0, perMonth - month),
                app >= appPerMonth);
    }

    /** Counts a reading about to be asked for, or refuses it with the limit that was reached. Returns its row. */
    @Transactional
    long reserve(UUID ownerId) {
        // One at a time across the app, so the app's monthly cap can't be overrun by readings at the same moment
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended('page-readings', 0))").query().listOfRows();
        jdbc.sql("DELETE FROM page_readings WHERE read_at < now() - interval '62 days'").update();
        if (count("read_at >= date_trunc('month', now())", null) >= appPerMonth) {
            throw new LimitReachedException("app_limit");
        }
        if (count("owner_id = :owner AND read_at >= date_trunc('month', now())", ownerId) >= perMonth) {
            throw new LimitReachedException("month_limit");
        }
        if (count("owner_id = :owner AND read_at >= date_trunc('day', now())", ownerId) >= perDay) {
            throw new LimitReachedException("day_limit");
        }
        return jdbc.sql("INSERT INTO page_readings (owner_id, outcome) VALUES (:owner, 'pending') RETURNING id")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
    }

    /** How it went: read, nothing_read, unavailable or timed_out. Still counted either way: Google may have charged. */
    @Transactional
    void finish(long id, String outcome) {
        jdbc.sql("UPDATE page_readings SET outcome = :outcome WHERE id = :id")
                .param("outcome", outcome)
                .param("id", id)
                .update();
    }

    private long count(String where, UUID ownerId) {
        var sql = jdbc.sql("SELECT count(*) FROM page_readings WHERE " + where);
        if (ownerId != null) {
            sql = sql.param("owner", ownerId);
        }
        return sql.query(Long.class).single();
    }
}
