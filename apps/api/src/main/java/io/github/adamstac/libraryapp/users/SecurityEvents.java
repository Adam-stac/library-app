package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The account's security event log: sign-ins, failures, lockouts and every change to how the account is protected.
 * Each event notes the device and IP address of the request that caused it. Recorded in the same transaction as
 * the change itself, so the log never claims something that was rolled back.
 */
@Component
class SecurityEvents {

    // Event types, shown to the owner by the web app
    static final String SIGN_IN = "sign_in";
    static final String SIGN_IN_FAILED = "sign_in_failed";
    static final String ACCOUNT_LOCKED = "account_locked";
    static final String SECOND_STEP_FAILED = "second_step_failed";
    static final String SIGN_OUT = "sign_out";
    static final String SESSION_ENDED = "session_ended";
    static final String OTHER_SESSIONS_ENDED = "other_sessions_ended";
    static final String PASSWORD_CHANGED = "password_changed";
    static final String PASSWORD_RESET = "password_reset";
    static final String TWO_FACTOR_ON = "two_factor_on";
    static final String TWO_FACTOR_OFF = "two_factor_off";
    static final String RECOVERY_CODE_USED = "recovery_code_used";
    static final String RECOVERY_CODES_NEW = "recovery_codes_new";
    static final String PASSKEY_ADDED = "passkey_added";
    static final String PASSKEY_REMOVED = "passkey_removed";

    static final int RETENTION_DAYS = 90;

    private static final Logger log = LoggerFactory.getLogger(SecurityEvents.class);

    public record Event(String type, String detail, String device, String ip, OffsetDateTime occurredAt) {}

    private final JdbcClient jdbc;

    SecurityEvents(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void record(UUID userId, String type) {
        record(userId, type, null);
    }

    void record(UUID userId, String type, String detail) {
        HttpServletRequest request = currentRequest();
        jdbc.sql("""
                        INSERT INTO security_events (id, user_id, type, detail, device, ip)
                        VALUES (:id, :userId, :type, :detail, :device, :ip)
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("type", type)
                .param("detail", detail == null ? null : truncate(detail, 100))
                .param("device", currentDevice())
                .param("ip", request == null ? null : truncate(request.getRemoteAddr(), 45))
                .update();
    }

    List<Event> recent(UUID userId, int limit) {
        return jdbc.sql("""
                        SELECT type, detail, device, ip, occurred_at FROM security_events
                        WHERE user_id = :id ORDER BY occurred_at DESC LIMIT :limit
                        """)
                .param("id", userId)
                .param("limit", limit)
                .query((rs, rowNum) -> new Event(
                        rs.getString("type"),
                        rs.getString("detail"),
                        rs.getString("device"),
                        rs.getString("ip"),
                        rs.getObject("occurred_at", OffsetDateTime.class)))
                .list();
    }

    /** True if this is the account's first sign-in, or the first from this kind of device in the last 90 days. */
    boolean isNewDevice(UUID userId, String device) {
        return jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM security_events WHERE user_id = :id AND type = 'sign_in')
                           AND NOT EXISTS (SELECT 1 FROM security_events
                                           WHERE user_id = :id AND type = 'sign_in' AND device = :device)
                        """)
                .param("id", userId)
                .param("device", device)
                .query(Boolean.class)
                .single();
    }

    String currentDevice() {
        HttpServletRequest request = currentRequest();
        return Devices.describe(request == null ? null : request.getHeader("User-Agent"));
    }

    String currentIp() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : request.getRemoteAddr();
    }

    @Scheduled(cron = "0 41 * * * *") // every hour, at 41 minutes past
    void runHourly() {
        deleteOld();
    }

    int deleteOld() {
        int deleted = jdbc.sql("DELETE FROM security_events WHERE occurred_at < now() - make_interval(days => :days)")
                .param("days", RETENTION_DAYS)
                .update();
        if (deleted > 0) {
            log.info("Deleted {} security events older than {} days", deleted, RETENTION_DAYS);
        }
        return deleted;
    }

    private static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest()
                : null;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
