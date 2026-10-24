package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.InvalidRequestException;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

/**
 * "Where you're signed in": the account's live sessions, read from the session store. Sessions are identified to the
 * web app by a one-way handle, never by their real ID: the real ID is what the session cookie carries, so showing it
 * would hand out the keys to every other session.
 *
 * <p>Each session is loaded on its own with {@code findById}. Spring Session's {@code findByPrincipalName} can't be
 * used for this: on Postgres it can split one session's attributes across several copies when the database returns
 * the joined rows out of order, so the list would lose the device and IP address.
 */
@Service
class ActiveSessions {

    public record ActiveSession(
            String handle, String device, String ip, Instant signedInAt, Instant lastActiveAt, boolean current) {}

    private final FindByIndexNameSessionRepository<? extends Session> sessions;
    private final SecurityEvents events;
    private final JdbcClient jdbc;

    ActiveSessions(
            FindByIndexNameSessionRepository<? extends Session> sessions, SecurityEvents events, JdbcClient jdbc) {
        this.sessions = sessions;
        this.events = events;
        this.jdbc = jdbc;
    }

    List<ActiveSession> list(UUID userId, String currentSessionId) {
        return liveSessions(userId).stream()
                .map(session -> view(session, currentSessionId))
                .sorted(Comparator.comparing(ActiveSession::current).reversed()
                        .thenComparing(ActiveSession::lastActiveAt, Comparator.reverseOrder()))
                .toList();
    }

    /** Signs out one other device. The current one signs out with "Sign out" instead. */
    void end(UUID userId, String currentSessionId, String handle) {
        Session target = liveSessions(userId).stream()
                .filter(session -> handleOf(session.getId()).equals(handle))
                .findFirst()
                .orElseThrow(() -> new InvalidRequestException("not_found"));
        if (target.getId().equals(currentSessionId)) {
            throw new InvalidRequestException("current_session");
        }
        sessions.deleteById(target.getId());
        events.record(userId, SecurityEvents.SESSION_ENDED, deviceOf(target));
    }

    /** Signs out every other device; returns how many. */
    int endOthers(UUID userId, String currentSessionId) {
        List<String> others = sessionIds(userId).stream()
                .filter(id -> !id.equals(currentSessionId))
                .toList();
        others.forEach(sessions::deleteById);
        events.record(userId, SecurityEvents.OTHER_SESSIONS_ENDED, String.valueOf(others.size()));
        return others.size();
    }

    /** The account's sessions that haven't expired, each loaded in full. */
    private List<Session> liveSessions(UUID userId) {
        return sessionIds(userId).stream()
                .map(id -> (Session) sessions.findById(id)) // null if it expired or ended meanwhile
                .filter(Objects::nonNull)
                .toList();
    }

    private List<String> sessionIds(UUID userId) {
        return jdbc.sql("SELECT session_id FROM spring_session WHERE principal_name = :name")
                .param("name", userId.toString())
                .query(String.class)
                .list()
                .stream()
                .map(String::strip) // CHAR(36) columns may come back padded
                .toList();
    }

    static String handleOf(String sessionId) {
        return Tokens.hash("session-handle:" + sessionId).substring(0, 32);
    }

    private static ActiveSession view(Session session, String currentSessionId) {
        Object signedInAt = session.getAttribute(SignInSessions.SIGNED_IN_AT);
        Object ip = session.getAttribute(SignInSessions.IP);
        return new ActiveSession(
                handleOf(session.getId()),
                deviceOf(session),
                ip instanceof String address ? address : null,
                signedInAt instanceof Long millis ? Instant.ofEpochMilli(millis) : session.getCreationTime(),
                session.getLastAccessedTime(),
                session.getId().equals(currentSessionId));
    }

    private static String deviceOf(Session session) {
        return session.getAttribute(SignInSessions.DEVICE) instanceof String device ? device : Devices.UNKNOWN;
    }
}
