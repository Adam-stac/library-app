package io.github.adamstac.libraryapp.users;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Data minimisation: expired reset links are deleted. */
@Component
class PasswordResetCleanup {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetCleanup.class);

    private final JdbcClient jdbc;

    PasswordResetCleanup(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 23 * * * *") // every hour, at 23 minutes past
    void runHourly() {
        deleteExpired();
    }

    int deleteExpired() {
        int deleted = jdbc.sql("DELETE FROM password_resets WHERE expires_at < now()").update();
        if (deleted > 0) {
            log.info("Deleted {} expired password reset links", deleted);
        }
        return deleted;
    }
}
