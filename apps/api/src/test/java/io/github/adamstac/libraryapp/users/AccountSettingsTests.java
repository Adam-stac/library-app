package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.users.RegistrationTests.RecordingMailer;
import io.github.adamstac.libraryapp.users.RegistrationTests.SentEmail;
import java.net.http.HttpResponse;
import java.time.Instant;
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
class AccountSettingsTests {

    static final String EMAIL = "reader@example.com";
    static final String NEW_EMAIL = "new.address@example.org";
    static final String PASSWORD = "correct horse battery staple 42";
    static final Pattern CONFIRM_LINK = Pattern.compile("/confirm-email-change#token=([A-Za-z0-9_-]{43})");
    static final Pattern SECRET = Pattern.compile("\"secret\":\"([A-Z2-7]+)\"");
    static final Pattern RECOVERY_CODE = Pattern.compile("[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}");

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
    private AccountService accounts;

    private UUID userId;

    @BeforeEach
    void createAccount() {
        mailer.sent.clear();
        rateLimitFilter.reset();
        jdbc.sql("DELETE FROM spring_session").update();
        jdbc.sql("DELETE FROM users").update();
        userId = createUser(EMAIL);
    }

    // ---- Language -----------------------------------------------------------------------------------------

    @Test
    void theLanguageForEmailsCanBeChanged() throws Exception {
        TestBrowser browser = signedIn();

        assertThat(browser.post("/api/v1/auth/preferences", "{\"language\":\"ar\"}").statusCode()).isEqualTo(204);

        assertThat(browser.get("/api/v1/auth/me").body()).contains("\"language\":\"ar\"");
        browser.post("/api/v1/auth/password-reset/request", "{\"email\":\"" + EMAIL + "\"}");
        assertThat(mailer.sent).last().satisfies(email -> assertThat(email.body()).contains("السلام عليكم"));
    }

    @Test
    void onlySupportedLanguagesAreAccepted() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> response = browser.post("/api/v1/auth/preferences", "{\"language\":\"fr\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("language").contains("invalid");
    }

    // ---- Changing the email address -----------------------------------------------------------------------

    @Test
    void changingTheEmailNeedsTheNewInboxAndWarnsTheOldOne() throws Exception {
        TestBrowser browser = signedIn();
        TestBrowser otherDevice = signedIn();

        HttpResponse<String> requested = requestChange(browser, NEW_EMAIL, PASSWORD);

        assertThat(requested.statusCode()).as(requested.body()).isEqualTo(202);
        assertThat(currentEmail()).as("nothing changes until the link is opened").isEqualTo(EMAIL);
        SentEmail warning = emailTo(EMAIL);
        assertThat(warning.subject()).contains("email was requested");
        assertThat(warning.body()).contains("n•••@example.org").doesNotContain(NEW_EMAIL);
        String token = tokenFrom(emailTo(NEW_EMAIL));
        assertThat(jdbc.sql("SELECT count(*) FROM email_changes WHERE token_hash = :token")
                        .param("token", token)
                        .query(Long.class)
                        .single())
                .as("only a hash of the token is stored")
                .isZero();
        mailer.sent.clear();

        HttpResponse<String> confirmed = browser.post("/api/v1/auth/confirm-email-change", token(token));

        assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(204);
        assertThat(currentEmail()).isEqualTo(NEW_EMAIL);
        assertThat(browser.isSignedIn()).as("this device stays signed in").isTrue();
        assertThat(otherDevice.isSignedIn()).as("other devices are signed out").isFalse();
        assertThat(emailTo(EMAIL).subject()).contains("was changed");
        assertThat(browser.post("/api/v1/auth/confirm-email-change", token(token)).statusCode())
                .as("the link works once")
                .isEqualTo(400);
        rateLimitFilter.reset();
        assertThat(new TestBrowser(port).signIn(NEW_EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        assertThat(new TestBrowser(port).signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(400);
    }

    @Test
    void theLinkWorksWithoutBeingSignedIn() throws Exception {
        TestBrowser browser = signedIn();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        String token = tokenFrom(emailTo(NEW_EMAIL));

        // e.g. opened on a phone that has never signed in
        HttpResponse<String> confirmed = new TestBrowser(port).post("/api/v1/auth/confirm-email-change", token(token));

        assertThat(confirmed.statusCode()).isEqualTo(204);
        assertThat(currentEmail()).isEqualTo(NEW_EMAIL);
        assertThat(browser.isSignedIn()).as("every session ends: none of them opened the link").isFalse();
    }

    @Test
    void changingTheEmailNeedsThePassword() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> response = requestChange(browser, NEW_EMAIL, "not my password");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("currentPassword").contains("incorrect");
        assertThat(mailer.sent).isEmpty();
        assertThat(jdbc.sql("SELECT failed_logins FROM users").query(Integer.class).single())
                .as("wrong guesses count towards the lock")
                .isEqualTo(1);
    }

    @Test
    void withTwoStepVerificationOnACodeIsNeededToo() throws Exception {
        TestBrowser browser = signedIn();
        String recoveryCode = enableTwoStep(browser);
        mailer.sent.clear();

        HttpResponse<String> withoutCode = requestChange(browser, NEW_EMAIL, PASSWORD);
        assertThat(withoutCode.statusCode()).isEqualTo(400);
        assertThat(withoutCode.body()).contains("code").contains("required");

        HttpResponse<String> wrongCode = browser.post("/api/v1/auth/change-email", changeBody(NEW_EMAIL, PASSWORD, "000000"));
        assertThat(wrongCode.statusCode()).isEqualTo(400);
        assertThat(wrongCode.body()).contains("invalid_code");
        assertThat(mailer.sent).isEmpty();

        HttpResponse<String> withCode = browser.post("/api/v1/auth/change-email", changeBody(NEW_EMAIL, PASSWORD, recoveryCode));
        assertThat(withCode.statusCode()).as(withCode.body()).isEqualTo(202);
    }

    @Test
    void anAddressThatAlreadyHasAnAccountGetsTheSameAnswerButNothingChanges() throws Exception {
        createUser(NEW_EMAIL);
        TestBrowser browser = signedIn();

        HttpResponse<String> response = requestChange(browser, NEW_EMAIL, PASSWORD);

        assertThat(response.statusCode()).as("no account enumeration").isEqualTo(202);
        assertThat(emailTo(NEW_EMAIL).subject()).contains("tried to use your email");
        assertThat(emailTo(NEW_EMAIL).body()).doesNotContain("#token=");
        assertThat(currentEmail()).isEqualTo(EMAIL);
    }

    @Test
    void anAddressTakenAfterTheLinkWasSentCantBeUsed() throws Exception {
        TestBrowser browser = signedIn();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        String token = tokenFrom(emailTo(NEW_EMAIL));
        createUser(NEW_EMAIL);

        HttpResponse<String> confirmed = browser.post("/api/v1/auth/confirm-email-change", token(token));

        assertThat(confirmed.statusCode()).isEqualTo(400);
        assertThat(currentEmail()).isEqualTo(EMAIL);
    }

    @Test
    void theSameAddressIsRefused() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> response = requestChange(browser, "Reader@Example.com", PASSWORD);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("newEmail").contains("same_email");
    }

    @Test
    void onlyTheNewestLinkWorksAndAtMostThreeAreSentAnHour() throws Exception {
        TestBrowser browser = signedIn();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        String first = tokenFrom(emailTo(NEW_EMAIL));
        mailer.sent.clear();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        String second = tokenFrom(emailTo(NEW_EMAIL));

        assertThat(browser.post("/api/v1/auth/confirm-email-change", token(first)).statusCode()).isEqualTo(400);

        requestChange(browser, NEW_EMAIL, PASSWORD);
        mailer.sent.clear();
        rateLimitFilter.reset();
        assertThat(requestChange(browser, NEW_EMAIL, PASSWORD).statusCode()).isEqualTo(202);
        assertThat(mailer.sent).as("the fourth request in an hour sends nothing").isEmpty();
        assertThat(second).isNotEqualTo(first);
    }

    @Test
    void severalAccountsCantFloodOneAddress() throws Exception {
        for (int i = 0; i < 4; i++) {
            String email = "sender" + i + "@example.com";
            createUser(email);
            rateLimitFilter.reset();
            TestBrowser browser = new TestBrowser(port);
            assertThat(browser.signIn(email, PASSWORD).statusCode()).isEqualTo(200);
            assertThat(requestChange(browser, NEW_EMAIL, PASSWORD).statusCode()).isEqualTo(202);
        }

        assertThat(mailer.sent.stream().filter(email -> email.to().equals(NEW_EMAIL)))
                .hasSize(AccountService.MAX_EMAILS_PER_NEW_ADDRESS_PER_HOUR);
    }

    @Test
    void expiredLinksAreRefusedAndThenDeleted() throws Exception {
        TestBrowser browser = signedIn();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        String token = tokenFrom(emailTo(NEW_EMAIL));
        jdbc.sql("UPDATE email_changes SET expires_at = now() - interval '2 hours'").update();

        assertThat(browser.post("/api/v1/auth/confirm-email-change", token(token)).statusCode()).isEqualTo(400);
        assertThat(accounts.deleteExpiredEmailChanges()).isEqualTo(1);
    }

    @Test
    void theChangeIsInTheSecurityActivity() throws Exception {
        TestBrowser browser = signedIn();
        requestChange(browser, NEW_EMAIL, PASSWORD);
        browser.post("/api/v1/auth/confirm-email-change", token(tokenFrom(emailTo(NEW_EMAIL))));

        assertThat(browser.get("/api/v1/auth/security-events").body())
                .contains("email_changed")
                .contains("email_change_requested")
                .contains("n•••@example.org")
                .doesNotContain(NEW_EMAIL);
    }

    // ---- Deleting the account -----------------------------------------------------------------------------

    @Test
    void deletingTheAccountRemovesEverythingAndSignsOutEverywhere() throws Exception {
        TestBrowser browser = signedIn();
        TestBrowser otherDevice = signedIn();

        HttpResponse<String> response = browser.post("/api/v1/auth/delete-account", password(PASSWORD));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(204);
        assertThat(jdbc.sql("SELECT count(*) FROM users").query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM security_events").query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name IS NOT NULL")
                        .query(Long.class)
                        .single())
                .isZero();
        assertThat(browser.isSignedIn()).isFalse();
        assertThat(otherDevice.isSignedIn()).isFalse();
        assertThat(emailTo(EMAIL).subject()).contains("was deleted");
        rateLimitFilter.reset();
        assertThat(new TestBrowser(port).signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(400);
    }

    @Test
    void deletingTheAccountNeedsThePasswordAndTheCode() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> wrongPassword = browser.post("/api/v1/auth/delete-account", password("not my password"));
        assertThat(wrongPassword.statusCode()).isEqualTo(400);
        assertThat(wrongPassword.body()).contains("incorrect");

        String recoveryCode = enableTwoStep(browser);
        HttpResponse<String> withoutCode = browser.post("/api/v1/auth/delete-account", password(PASSWORD));
        assertThat(withoutCode.statusCode()).isEqualTo(400);
        assertThat(withoutCode.body()).contains("code").contains("required");
        assertThat(currentEmail()).isEqualTo(EMAIL);

        HttpResponse<String> withCode = browser.post(
                "/api/v1/auth/delete-account", "{\"currentPassword\":\"" + PASSWORD + "\",\"code\":\"" + recoveryCode + "\"}");
        assertThat(withCode.statusCode()).as(withCode.body()).isEqualTo(204);
        assertThat(jdbc.sql("SELECT count(*) FROM users").query(Long.class).single()).isZero();
    }

    @Test
    void settingsNeedSignInAndTheCsrfToken() throws Exception {
        TestBrowser anonymous = new TestBrowser(port);
        assertThat(anonymous.post("/api/v1/auth/preferences", "{\"language\":\"ar\"}").statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/change-email", changeBody(NEW_EMAIL, PASSWORD, null)).statusCode())
                .isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/delete-account", password(PASSWORD)).statusCode()).isEqualTo(401);

        TestBrowser browser = signedIn();
        HttpResponse<String> withoutCsrf = browser.send("POST", "/api/v1/auth/delete-account", password(PASSWORD), false);
        assertThat(withoutCsrf.statusCode()).isEqualTo(403);
        assertThat(currentEmail()).isEqualTo(EMAIL);
    }

    @Test
    void hostileInputIsRejectedCleanly() throws Exception {
        TestBrowser browser = signedIn();
        String[] bodies = {
            "", "{", "null", "[]", "42", "{\"language\":123}", "{\"language\":\"\\u202Een\"}", "{\"newEmail\":\"x\"}",
            "{\"token\":\"" + "A".repeat(500) + "\"}", "{\"token\":[\"a\"]}",
            "{\"currentPassword\":\"" + "p".repeat(2000) + "\"}",
            "{\"newEmail\":\"a@b.c\",\"currentPassword\":\"x\",\"code\":{}}"
        };
        String[] paths = {
            "/api/v1/auth/preferences",
            "/api/v1/auth/change-email",
            "/api/v1/auth/confirm-email-change",
            "/api/v1/auth/delete-account"
        };
        for (String path : paths) {
            for (String body : bodies) {
                rateLimitFilter.reset();
                HttpResponse<String> response = browser.post(path, body);

                assertThat(response.statusCode()).as(path + " " + body).isIn(400, 413);
                assertThat(response.body()).as(path + " " + body).doesNotContainIgnoringCase("exception");
            }
        }
        assertThat(currentEmail()).isEqualTo(EMAIL);
        assertThat(browser.isSignedIn()).isTrue();
    }

    // ---- Helpers ------------------------------------------------------------------------------------------

    private UUID createUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO users (id, email, password_hash, preferred_language) VALUES (:id, :email, :hash, 'en')")
                .param("id", id)
                .param("email", email)
                .param("hash", passwordEncoder.encode(PASSWORD))
                .update();
        return id;
    }

    private TestBrowser signedIn() throws Exception {
        rateLimitFilter.reset();
        TestBrowser browser = new TestBrowser(port);
        assertThat(browser.signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        return browser;
    }

    /** Turns on two-step verification and returns one of the recovery codes. */
    private String enableTwoStep(TestBrowser browser) throws Exception {
        rateLimitFilter.reset();
        Matcher secret = SECRET.matcher(browser.post("/api/v1/auth/2fa/totp/setup", password(PASSWORD)).body());
        assertThat(secret.find()).isTrue();
        String code = Totp.code(Base32.decode(secret.group(1)), Totp.stepAt(Instant.now()));
        HttpResponse<String> confirmed = browser.post("/api/v1/auth/2fa/totp/confirm", "{\"code\":\"" + code + "\"}");
        assertThat(confirmed.statusCode()).isEqualTo(200);
        Matcher recovery = RECOVERY_CODE.matcher(confirmed.body());
        assertThat(recovery.find()).isTrue();
        rateLimitFilter.reset();
        return recovery.group();
    }

    private HttpResponse<String> requestChange(TestBrowser browser, String newEmail, String password) throws Exception {
        return browser.post("/api/v1/auth/change-email", changeBody(newEmail, password, null));
    }

    private static String changeBody(String newEmail, String password, String code) {
        return "{\"newEmail\":\"%s\",\"currentPassword\":\"%s\"%s}"
                .formatted(newEmail, password, code == null ? "" : ",\"code\":\"" + code + "\"");
    }

    private String currentEmail() {
        return jdbc.sql("SELECT email FROM users WHERE id = :id").param("id", userId).query(String.class).single();
    }

    private SentEmail emailTo(String address) {
        return mailer.sent.stream()
                .filter(email -> email.to().equals(address))
                .reduce((first, second) -> second)
                .orElseThrow(() -> new AssertionError("no email to " + address + " in " + mailer.sent));
    }

    private static String tokenFrom(SentEmail email) {
        Matcher matcher = CONFIRM_LINK.matcher(email.body());
        assertThat(matcher.find()).as(email.body()).isTrue();
        return matcher.group(1);
    }

    private static String token(String token) {
        return "{\"token\":\"" + token + "\"}";
    }

    private static String password(String password) {
        return "{\"currentPassword\":\"" + password + "\"}";
    }
}
