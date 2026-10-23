package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.users.RegistrationTests.RecordingMailer;
import io.github.adamstac.libraryapp.users.RegistrationTests.SentEmail;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

@Import({TestcontainersConfiguration.class, RegistrationTests.TestBeans.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PasswordTests {

    static final String EMAIL = "reader@example.com";
    static final String OLD_PASSWORD = "correct horse battery staple 42";
    static final String NEW_PASSWORD = "a brand new passphrase for 2026";
    static final Pattern RESET_LINK = Pattern.compile("/reset-password#token=([A-Za-z0-9_-]{43})");

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
    private PasswordResetCleanup cleanup;

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
                .param("hash", passwordEncoder.encode(OLD_PASSWORD))
                .update();
    }

    // ---- Forgotten password -------------------------------------------------------------------------------

    @Test
    void requestingAResetEmailsAOneHourSingleUseLinkAndStoresOnlyItsHash() throws Exception {
        HttpResponse<String> response = requestReset("  Reader@Example.com ");

        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(mailer.sent).hasSize(1);
        assertThat(mailer.sent.getFirst().to()).isEqualTo(EMAIL);
        assertThat(mailer.sent.getFirst().body()).contains("1 hour");
        String token = resetTokenFrom(mailer.sent.getFirst());
        assertThat(count("SELECT count(*) FROM password_resets WHERE token_hash = :v", Tokens.hash(token))).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM password_resets WHERE token_hash = :v", token)).isZero();
        assertThat(count(
                        "SELECT count(*) FROM password_resets WHERE token_hash = :v"
                                + " AND expires_at BETWEEN now() + interval '59 minutes' AND now() + interval '61 minutes'",
                        Tokens.hash(token)))
                .isEqualTo(1);
    }

    @Test
    void anUnknownEmailGetsTheSameAnswerAndNoEmailIsSent() throws Exception {
        HttpResponse<String> known = requestReset(EMAIL);
        mailer.sent.clear();
        HttpResponse<String> unknown = requestReset("nobody@example.com");

        assertThat(unknown.statusCode()).isEqualTo(known.statusCode()).isEqualTo(202);
        assertThat(unknown.body()).isEqualTo(known.body());
        assertThat(mailer.sent).isEmpty();
    }

    @Test
    void resettingChangesThePasswordEndsEverySessionAndTellsTheOwner() throws Exception {
        TestBrowser signedInElsewhere = new TestBrowser(port);
        assertThat(signedInElsewhere.signIn(EMAIL, OLD_PASSWORD).statusCode()).isEqualTo(200);
        requestReset(EMAIL);
        String token = resetTokenFrom(mailer.sent.getFirst());
        mailer.sent.clear();

        assertThat(confirmReset(token, NEW_PASSWORD).statusCode()).isEqualTo(204);

        assertThat(signedInElsewhere.isSignedIn()).as("sessions using the old password are ended").isFalse();
        assertThat(new TestBrowser(port).signIn(EMAIL, OLD_PASSWORD).statusCode()).isEqualTo(400);
        assertThat(new TestBrowser(port).signIn(EMAIL, NEW_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(mailer.sent).singleElement().satisfies(email -> {
            assertThat(email.to()).isEqualTo(EMAIL);
            assertThat(email.subject()).contains("password was changed");
            assertThat(email.body()).contains("/forgot-password");
        });

        HttpResponse<String> again = confirmReset(token, "yet another passphrase for later");
        assertThat(again.statusCode()).as("the link works only once").isEqualTo(400);
        assertThat(again.body()).contains("invalid_token");
    }

    @Test
    void resettingLiftsTheTemporaryLock() throws Exception {
        jdbc.sql("UPDATE users SET failed_logins = 5, locked_until = now() + interval '15 minutes'").update();
        requestReset(EMAIL);

        confirmReset(resetTokenFrom(mailer.sent.getFirst()), NEW_PASSWORD);

        assertThat(new TestBrowser(port).signIn(EMAIL, NEW_PASSWORD).statusCode()).isEqualTo(200);
    }

    @Test
    void anExpiredLinkIsRejected() throws Exception {
        requestReset(EMAIL);
        jdbc.sql("UPDATE password_resets SET expires_at = now() - interval '1 second'").update();

        HttpResponse<String> response = confirmReset(resetTokenFrom(mailer.sent.getFirst()), NEW_PASSWORD);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("invalid_token");
        assertThat(cleanup.deleteExpired()).isEqualTo(1);
    }

    @Test
    void aWeakOrBreachedNewPasswordIsRejectedAndTheLinkStillWorks() throws Exception {
        requestReset(EMAIL);
        String token = resetTokenFrom(mailer.sent.getFirst());

        assertThat(confirmReset(token, "too short").body()).contains("too_short");
        assertThat(confirmReset(token, RegistrationTests.BREACHED_PASSWORD).body()).contains("compromised");

        assertThat(confirmReset(token, NEW_PASSWORD).statusCode()).isEqualTo(204);
    }

    @Test
    void atMostThreeResetEmailsPerHour() throws Exception {
        for (int i = 0; i < 5; i++) {
            rateLimitFilter.reset();
            assertThat(requestReset(EMAIL).statusCode()).isEqualTo(202);
        }

        assertThat(mailer.sent).hasSize(PasswordService.MAX_RESET_EMAILS_PER_HOUR);
    }

    @Test
    void resetRequestsNeedTheCsrfToken() throws Exception {
        HttpResponse<String> response = new TestBrowser(port)
                .send("POST", "/api/v1/auth/password-reset/request", "{\"email\":\"" + EMAIL + "\"}", false);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(mailer.sent).isEmpty();
    }

    // ---- Changing the password while signed in -----------------------------------------------------------

    @Test
    void changingThePasswordNeedsSignIn() throws Exception {
        assertThat(changePassword(new TestBrowser(port), OLD_PASSWORD, NEW_PASSWORD).statusCode())
                .isEqualTo(401);
    }

    @Test
    void changingThePasswordKeepsThisSessionWithANewIdAndEndsTheOthers() throws Exception {
        TestBrowser here = new TestBrowser(port);
        TestBrowser elsewhere = new TestBrowser(port);
        here.signIn(EMAIL, OLD_PASSWORD);
        elsewhere.signIn(EMAIL, OLD_PASSWORD);
        String sessionBefore = here.cookies.get("__Host-SESSION");

        assertThat(changePassword(here, OLD_PASSWORD, NEW_PASSWORD).statusCode()).isEqualTo(204);

        assertThat(here.isSignedIn()).isTrue();
        assertThat(here.cookies.get("__Host-SESSION")).isNotEqualTo(sessionBefore);
        assertThat(elsewhere.isSignedIn()).as("other devices are signed out").isFalse();
        assertThat(new TestBrowser(port).signIn(EMAIL, NEW_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(mailer.sent).singleElement().satisfies(email -> assertThat(email.subject())
                .contains("password was changed"));
    }

    @Test
    void aWrongCurrentPasswordIsRejectedAndCountsTowardsTheLock() throws Exception {
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, OLD_PASSWORD);

        HttpResponse<String> response = changePassword(browser, "not my current password", NEW_PASSWORD);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("currentPassword").contains("incorrect");
        assertThat(jdbc.sql("SELECT failed_logins FROM users").query(Integer.class).single()).isEqualTo(1);
        assertThat(new TestBrowser(port).signIn(EMAIL, OLD_PASSWORD).statusCode())
                .as("the password didn't change")
                .isEqualTo(200);
    }

    @Test
    void aBreachedNewPasswordIsRejectedWhenChanging() throws Exception {
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, OLD_PASSWORD);

        HttpResponse<String> response = changePassword(browser, OLD_PASSWORD, RegistrationTests.BREACHED_PASSWORD);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("newPassword").contains("compromised");
    }

    @Test
    void changingThePasswordNeedsTheCsrfToken() throws Exception {
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, OLD_PASSWORD);

        HttpResponse<String> response = browser.send("POST", "/api/v1/auth/change-password", """
                {"currentPassword":"%s","newPassword":"%s"}""".formatted(OLD_PASSWORD, NEW_PASSWORD), false);

        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        String[] bodies = {
            "", "{", "[]", "{\"token\":[\"a\"]}", "{\"email\":\"\\u0000@x.y\"}",
            "{\"token\":\"x\",\"password\":null}", "{\"token\":\"" + "x".repeat(101) + "\",\"password\":\"p\"}"
        };
        for (String path : new String[] {"/api/v1/auth/password-reset/request", "/api/v1/auth/password-reset/confirm"}) {
            for (String body : bodies) {
                rateLimitFilter.reset();

                HttpResponse<String> response = new TestBrowser(port).post(path, body);

                assertThat(response.statusCode()).as(path + " " + body).isEqualTo(400);
                assertThat(response.body()).as(path + " " + body)
                        .doesNotContainIgnoringCase("exception")
                        .doesNotContain("trace");
            }
        }
    }

    // ---- Helpers -------------------------------------------------------------------------------------------

    private HttpResponse<String> requestReset(String email) throws Exception {
        return new TestBrowser(port).post("/api/v1/auth/password-reset/request", "{\"email\":\"" + email + "\"}");
    }

    private HttpResponse<String> confirmReset(String token, String password) throws Exception {
        return new TestBrowser(port).post("/api/v1/auth/password-reset/confirm", """
                {"token":"%s","password":"%s"}""".formatted(token, password));
    }

    private HttpResponse<String> changePassword(TestBrowser browser, String current, String newPassword)
            throws Exception {
        return browser.post("/api/v1/auth/change-password", """
                {"currentPassword":"%s","newPassword":"%s"}""".formatted(current, newPassword));
    }

    private static String resetTokenFrom(SentEmail email) {
        Matcher matcher = RESET_LINK.matcher(email.body());
        assertThat(matcher.find()).as("reset link in: " + email.body()).isTrue();
        return matcher.group(1);
    }

    private long count(String sql, String value) {
        return jdbc.sql(sql).param("v", value).query(Long.class).single();
    }
}
