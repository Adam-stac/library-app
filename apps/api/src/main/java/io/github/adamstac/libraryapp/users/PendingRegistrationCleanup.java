package io.github.adamstac.libraryapp.users;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Data minimisation (GDPR): unverified registrations, including their password hashes, are deleted once expired. */
@Component
class PendingRegistrationCleanup {

    private static final Logger log = LoggerFactory.getLogger(PendingRegistrationCleanup.class);

    private final JdbcClient jdbc;

    PendingRegistrationCleanup(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 17 * * * *") // every hour, at 17 minutes past
    void runHourly() {
        deleteExpired();
    }

    int deleteExpired() {
        int deleted = jdbc.sql("DELETE FROM pending_registrations WHERE expires_at < now()").update();
        if (deleted > 0) {
            log.info("Deleted {} expired pending registrations", deleted);
        }
        return deleted;
    }
}
