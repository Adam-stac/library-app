package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.users.RegistrationTests.RecordingMailer;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Import({TestcontainersConfiguration.class, RegistrationTests.TestBeans.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SecurityActivityTests {

    static final String EMAIL = "reader@example.com";
    static final String PASSWORD = "correct horse battery staple 42";
    static final JsonMapper JSON = JsonMapper.builder().build();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private RecordingMailer mailer;

    @Autowired
    private AuthRateLimitFilter rateLimitFilter;

    @Autowired
    private SecurityEvents securityEvents;

    @Autowired
    private DataSource dataSource;

    private UUID userId;

    @BeforeEach
    void createAccount() {
        mailer.sent.clear();
        rateLimitFilter.reset();
        jdbc.sql("DELETE FROM spring_session").update();
        jdbc.sql("DELETE FROM users").update();
        userId = UUID.randomUUID();
        jdbc.sql("INSERT INTO users (id, email, password_hash, preferred_language) VALUES (:id, :email, :hash, 'en')")
                .param("id", userId)
                .param("email", EMAIL)
                .param("hash", passwordEncoder.encode(PASSWORD))
                .update();
    }

    // ---- Security activity --------------------------------------------------------------------------------

    @Test
    void signingInIsRecordedWithTheDeviceButNotTheRawBrowserString() throws Exception {
        TestBrowser browser = signedIn(DevicesTests.CHROME_WINDOWS);

        List<Map<String, Object>> events = list(browser.get("/api/v1/auth/security-events"));

        assertThat(events).first().satisfies(event -> {
            assertThat(event).containsEntry("type", "sign_in").containsEntry("detail", "password");
            assertThat(event).containsEntry("device", "Chrome on Windows");
            assertThat(event.get("ip")).isNotNull();
        });
        assertThat(jdbc.sql("SELECT count(*) FROM security_events WHERE device LIKE '%Mozilla%'")
                        .query(Long.class).single())
                .isZero();
    }

    @Test
    void wrongPasswordsAndTheLockAreRecordedAndTheOwnerIsTold() throws Exception {
        for (int i = 0; i < LoginService.MAX_FAILURES_BEFORE_LOCK; i++) {
            new TestBrowser(port).signIn(EMAIL, "wrong password number " + i);
        }

        assertThat(types()).containsExactly(
                "account_locked", "sign_in_failed", "sign_in_failed", "sign_in_failed", "sign_in_failed", "sign_in_failed");
        assertThat(mailer.sent).singleElement().satisfies(email -> {
            assertThat(email.subject()).contains("paused");
            assertThat(email.body()).contains("/forgot-password");
        });

        rateLimitFilter.reset();
        new TestBrowser(port).signIn(EMAIL, "one more wrong password");
        assertThat(mailer.sent).as("the owner is told once, not on every attempt").hasSize(1);
    }

    @Test
    void aFloodOfFailuresIsCappedInTheLogButStillCountsTowardsTheLock() throws Exception {
        jdbc.sql("""
                        INSERT INTO security_events (id, user_id, type, detail)
                        SELECT gen_random_uuid(), :id, 'sign_in_failed', 'wrong_password' FROM generate_series(1, :n)
                        """)
                .param("id", userId)
                .param("n", SecurityEvents.MAX_FAILURES_LOGGED_PER_HOUR)
                .update();

        new TestBrowser(port).signIn(EMAIL, "one more wrong password");

        assertThat(jdbc.sql("SELECT count(*) FROM security_events WHERE type = 'sign_in_failed'")
                        .query(Long.class)
                        .single())
                .isEqualTo(SecurityEvents.MAX_FAILURES_LOGGED_PER_HOUR);
        assertThat(jdbc.sql("SELECT failed_logins FROM users").query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void securityChangesAreRecorded() throws Exception {
        TestBrowser browser = signedIn(null);
        browser.post("/api/v1/auth/change-password", """
                {"currentPassword":"%s","newPassword":"a brand new passphrase for 2026"}""".formatted(PASSWORD));
        browser.post("/api/v1/auth/logout", null);

        assertThat(types()).startsWith("sign_out", "password_changed", "sign_in");
    }

    @Test
    void theActivityIsOnlyVisibleWhenSignedIn() throws Exception {
        TestBrowser anonymous = new TestBrowser(port);

        assertThat(anonymous.get("/api/v1/auth/security-events").statusCode()).isEqualTo(401);
        assertThat(anonymous.get("/api/v1/auth/sessions").statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/sessions/end-others", null).statusCode()).isEqualTo(401);
    }

    @Test
    void eventsOlderThan90DaysAreDeleted() throws Exception {
        signedIn(null);
        jdbc.sql("UPDATE security_events SET occurred_at = now() - interval '91 days'").update();

        assertThat(securityEvents.deleteOld()).isEqualTo(1);
    }

    // ---- New-device emails --------------------------------------------------------------------------------

    @Test
    void theOwnerIsEmailedAboutASignInFromANewDevice() throws Exception {
        signedIn(DevicesTests.CHROME_WINDOWS);
        assertThat(mailer.sent).as("not for the very first sign-in").isEmpty();

        signedIn(DevicesTests.CHROME_WINDOWS);
        assertThat(mailer.sent).as("not for a device seen before").isEmpty();

        signedIn(DevicesTests.FIREFOX_LINUX);
        assertThat(mailer.sent).singleElement().satisfies(email -> {
            assertThat(email.subject()).contains("New sign-in");
            assertThat(email.body()).contains("Firefox on Linux").contains("/security").contains("/forgot-password");
        });
    }

    // ---- Where you're signed in ---------------------------------------------------------------------------

    @Test
    void theSessionListShowsEachDeviceAndWhichIsThisOne() throws Exception {
        TestBrowser laptop = signedIn(DevicesTests.CHROME_WINDOWS);
        signedIn(DevicesTests.FIREFOX_LINUX);

        HttpResponse<String> response = laptop.get("/api/v1/auth/sessions");
        List<Map<String, Object>> sessions = list(response);

        assertThat(sessions).hasSize(2);
        assertThat(sessions.getFirst()).containsEntry("current", true).containsEntry("device", "Chrome on Windows");
        assertThat(sessions.get(1)).containsEntry("current", false).containsEntry("device", "Firefox on Linux");
        // Real session IDs are the keys to those sessions: they must never be shown
        for (String sessionId : jdbc.sql("SELECT session_id FROM spring_session").query(String.class).list()) {
            assertThat(response.body()).doesNotContain(sessionId.strip());
        }
    }

    /**
     * Regression: Spring Session's findByPrincipalName assumes the database returns each session's attribute rows
     * together. A hash join returns them in table order, and an updated attribute moves to the end of the table, so
     * one session came back as several copies and the list showed "Unknown device". Forces exactly that plan.
     */
    @Test
    void theListKeepsEveryDetailWhateverOrderTheDatabaseReturnsRowsIn() throws Exception {
        TestBrowser laptop = signedIn(DevicesTests.CHROME_WINDOWS);
        signedIn(DevicesTests.FIREFOX_LINUX);
        // Rewrite the laptop's device attribute: Postgres stores the new row version after the other session's rows
        jdbc.sql("""
                        UPDATE spring_session_attributes SET attribute_bytes = attribute_bytes
                        WHERE attribute_name = :name AND session_primary_id =
                            (SELECT primary_id FROM spring_session ORDER BY creation_time LIMIT 1)
                        """)
                .param("name", SignInSessions.DEVICE)
                .update();
        planner("off");
        try {
            List<Map<String, Object>> sessions = list(laptop.get("/api/v1/auth/sessions"));

            assertThat(sessions).hasSize(2);
            assertThat(sessions.getFirst()).containsEntry("device", "Chrome on Windows");
            assertThat(sessions.getFirst().get("ip")).isNotNull();
            assertThat(sessions.get(1)).containsEntry("device", "Firefox on Linux");
        } finally {
            planner("on");
        }
    }

    @Test
    void signingOutAnotherDeviceEndsItsSession() throws Exception {
        TestBrowser laptop = signedIn(DevicesTests.CHROME_WINDOWS);
        TestBrowser phone = signedIn(DevicesTests.FIREFOX_LINUX);
        String phoneHandle = list(laptop.get("/api/v1/auth/sessions")).get(1).get("handle").toString();

        HttpResponse<String> response = laptop.post("/api/v1/auth/sessions/" + phoneHandle + "/end", null);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(phone.isSignedIn()).isFalse();
        assertThat(laptop.isSignedIn()).isTrue();
        assertThat(types()).first().isEqualTo("session_ended");
    }

    @Test
    void thisDeviceCantBeEndedFromTheList() throws Exception {
        TestBrowser laptop = signedIn(null);
        String ownHandle = list(laptop.get("/api/v1/auth/sessions")).getFirst().get("handle").toString();

        HttpResponse<String> response = laptop.post("/api/v1/auth/sessions/" + ownHandle + "/end", null);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("current_session");
    }

    @Test
    void anotherAccountsSessionCantBeEnded() throws Exception {
        TestBrowser mine = signedIn(null);
        String myHandle = list(mine.get("/api/v1/auth/sessions")).getFirst().get("handle").toString();
        UUID otherId = UUID.randomUUID();
        jdbc.sql("INSERT INTO users (id, email, password_hash, preferred_language) VALUES (:id, 'other@example.com', :hash, 'en')")
                .param("id", otherId)
                .param("hash", passwordEncoder.encode(PASSWORD))
                .update();
        rateLimitFilter.reset();
        TestBrowser theirs = new TestBrowser(port);
        theirs.signIn("other@example.com", PASSWORD);

        HttpResponse<String> response = theirs.post("/api/v1/auth/sessions/" + myHandle + "/end", null);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("not_found");
        assertThat(mine.isSignedIn()).isTrue();
    }

    @Test
    void signingOutEverywhereElseKeepsOnlyThisDevice() throws Exception {
        TestBrowser laptop = signedIn(DevicesTests.CHROME_WINDOWS);
        TestBrowser phone = signedIn(DevicesTests.FIREFOX_LINUX);
        TestBrowser tablet = signedIn(null);

        assertThat(laptop.post("/api/v1/auth/sessions/end-others", null).statusCode()).isEqualTo(204);

        assertThat(laptop.isSignedIn()).isTrue();
        assertThat(phone.isSignedIn()).isFalse();
        assertThat(tablet.isSignedIn()).isFalse();
        assertThat(list(laptop.get("/api/v1/auth/sessions"))).hasSize(1);
    }

    // ---- Helpers ------------------------------------------------------------------------------------------

    /** Turns nested-loop and merge joins off (or back on) for new connections, then renews the pool's connections. */
    private void planner(String setting) throws Exception {
        for (String join : List.of("enable_nestloop", "enable_mergejoin")) {
            jdbc.sql("DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET " + join + " = " + setting + "', current_database()); END $$")
                    .update();
        }
        dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean().softEvictConnections();
    }

    private TestBrowser signedIn(String userAgent) throws Exception {
        rateLimitFilter.reset();
        TestBrowser browser = new TestBrowser(port);
        browser.userAgent = userAgent;
        assertThat(browser.signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        return browser;
    }

    /** Event types, newest first. */
    private List<String> types() {
        return jdbc.sql("SELECT type FROM security_events ORDER BY occurred_at DESC, type")
                .query(String.class)
                .list();
    }

    private static List<Map<String, Object>> list(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return JSON.readValue(response.body(), new TypeReference<List<Map<String, Object>>>() {});
    }
}
