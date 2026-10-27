package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.users.RegistrationTests.RecordingMailer;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
class TwoFactorTests {

    static final String EMAIL = "reader@example.com";
    static final String PASSWORD = "correct horse battery staple 42";
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

    /** A signed-in browser with two-step verification turned on, plus what the person saw while setting it up. */
    record Enabled(TestBrowser browser, byte[] secret, long usedStep, List<String> recoveryCodes) {}

    // ---- Turning it on -------------------------------------------------------------------------------------

    @Test
    void turningItOnNeedsThePasswordThenACodeFromTheApp() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> wrongPassword = browser.post("/api/v1/auth/2fa/totp/setup", password("not my password"));
        assertThat(wrongPassword.statusCode()).isEqualTo(400);
        assertThat(wrongPassword.body()).contains("currentPassword").contains("incorrect");

        HttpResponse<String> setup = browser.post("/api/v1/auth/2fa/totp/setup", password(PASSWORD));
        assertThat(setup.statusCode()).isEqualTo(200);
        assertThat(setup.body()).contains("otpauth://totp/Khizana%3Areader%40example.com?secret=")
                .contains("issuer=Khizana");
        byte[] secret = Base32.decode(secretFrom(setup));
        assertThat(secret).hasSize(20);
        byte[] stored = jdbc.sql("SELECT secret_encrypted FROM totp_credentials").query(byte[].class).single();
        assertThat(stored).as("stored encrypted, never as-is").isNotEqualTo(secret).hasSize(12 + 20 + 16);

        HttpResponse<String> wrongCode = browser.post("/api/v1/auth/2fa/totp/confirm", code("000000".equals(codeNow(secret)) ? "111111" : "000000"));
        assertThat(wrongCode.statusCode()).isEqualTo(400);
        assertThat(wrongCode.body()).contains("invalid_code");
        assertThat(status(browser)).contains("\"enabled\":false");

        HttpResponse<String> confirmed = browser.post("/api/v1/auth/2fa/totp/confirm", code(codeNow(secret)));
        assertThat(confirmed.statusCode()).isEqualTo(200);
        assertThat(recoveryCodesIn(confirmed)).hasSize(10);
        assertThat(status(browser)).contains("\"enabled\":true").contains("\"recoveryCodesLeft\":10");
        assertThat(mailer.sent).singleElement().satisfies(email -> assertThat(email.subject())
                .contains("Two-step verification turned on"));
        assertThat(jdbc.sql("SELECT count(*) FROM recovery_codes WHERE code_hash LIKE '%-%'").query(Long.class).single())
                .as("only hashes are stored")
                .isZero();
    }

    @Test
    void turningItOnEndsOtherSessionsAndRenewsThisOne() throws Exception {
        TestBrowser elsewhere = signedIn();
        TestBrowser here = signedIn();
        String before = here.cookies.get("__Host-SESSION");

        enable(here);

        assertThat(here.isSignedIn()).isTrue();
        assertThat(here.cookies.get("__Host-SESSION")).isNotEqualTo(before);
        assertThat(elsewhere.isSignedIn()).isFalse();
    }

    @Test
    void managingItNeedsSignIn() throws Exception {
        TestBrowser anonymous = new TestBrowser(port);

        assertThat(anonymous.get("/api/v1/auth/2fa").statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/2fa/totp/setup", password(PASSWORD)).statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/2fa/totp/confirm", code("123456")).statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/2fa/recovery-codes", password(PASSWORD)).statusCode()).isEqualTo(401);
    }

    // ---- Signing in with it --------------------------------------------------------------------------------

    @Test
    void signingInThenNeedsACodeFromTheApp() throws Exception {
        Enabled enabled = enable(signedIn());
        TestBrowser browser = new TestBrowser(port);

        HttpResponse<String> password = browser.signIn(EMAIL, PASSWORD);
        assertThat(password.statusCode()).isEqualTo(200);
        assertThat(password.body()).contains("\"secondStepRequired\":true").doesNotContain(EMAIL);
        assertThat(browser.isSignedIn()).as("not signed in after the password alone").isFalse();
        assertThat(browser.get("/api/v1/auth/2fa").statusCode()).isEqualTo(401);

        HttpResponse<String> done = secondStep(browser, Totp.code(enabled.secret(), enabled.usedStep() + 1));
        assertThat(done.statusCode()).isEqualTo(200);
        assertThat(done.body()).contains(EMAIL).contains("\"secondStepRequired\":false");
        assertThat(browser.isSignedIn()).isTrue();
    }

    @Test
    void eachCodeFromTheAppWorksOnlyOnce() throws Exception {
        Enabled enabled = enable(signedIn());
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, PASSWORD);

        HttpResponse<String> replayed = secondStep(browser, Totp.code(enabled.secret(), enabled.usedStep()));

        assertThat(replayed.statusCode()).isEqualTo(400);
        assertThat(replayed.body()).contains("invalid_code");
        assertThat(browser.isSignedIn()).isFalse();
    }

    @Test
    void codesTypedInArabicIndicDigitsWork() throws Exception {
        Enabled enabled = enable(signedIn());
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, PASSWORD);
        String code = Totp.code(enabled.secret(), enabled.usedStep() + 1);
        StringBuilder arabic = new StringBuilder();
        code.chars().forEach(c -> arabic.append((char) ('٠' + (c - '0'))));

        assertThat(secondStep(browser, arabic.toString()).statusCode()).isEqualTo(200);
    }

    @Test
    void aRecoveryCodeWorksOnceAndTheOwnerIsTold() throws Exception {
        Enabled enabled = enable(signedIn());
        mailer.sent.clear();
        String recoveryCode = enabled.recoveryCodes().getFirst();

        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, PASSWORD);
        HttpResponse<String> used = secondStep(browser, recoveryCode.toLowerCase(Locale.ROOT).replace("-", " "));
        assertThat(used.statusCode()).isEqualTo(200);
        assertThat(mailer.sent).singleElement().satisfies(email -> {
            assertThat(email.subject()).contains("recovery code was used");
            assertThat(email.body()).contains("9 recovery codes left");
        });

        TestBrowser again = new TestBrowser(port);
        again.signIn(EMAIL, PASSWORD);
        assertThat(secondStep(again, recoveryCode).statusCode()).isEqualTo(400);
    }

    @Test
    void wrongCodesLockTheAccountAndThePasswordDoesNotResetTheCount() throws Exception {
        Enabled enabled = enable(signedIn());
        String wrong = Totp.code(enabled.secret(), enabled.usedStep() + 5); // valid format, wrong time

        for (int i = 0; i < LoginService.MAX_FAILURES_BEFORE_LOCK; i++) {
            rateLimitFilter.reset();
            TestBrowser attacker = new TestBrowser(port);
            assertThat(attacker.signIn(EMAIL, PASSWORD).body()).contains("\"secondStepRequired\":true");
            assertThat(secondStep(attacker, wrong).statusCode()).isEqualTo(400);
        }

        rateLimitFilter.reset();
        TestBrowser owner = new TestBrowser(port);
        assertThat(owner.signIn(EMAIL, PASSWORD).statusCode()).as("locked").isEqualTo(400);
    }

    @Test
    void theSecondStepNeedsThePasswordFirst() throws Exception {
        enable(signedIn());

        HttpResponse<String> response = secondStep(new TestBrowser(port), "123456");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("sign_in_again");
    }

    @Test
    void aPasswordResetDoesNotSkipTheSecondStep() throws Exception {
        enable(signedIn());
        mailer.sent.clear();
        new TestBrowser(port).post("/api/v1/auth/password-reset/request", "{\"email\":\"" + EMAIL + "\"}");
        Matcher link = Pattern.compile("#token=([A-Za-z0-9_-]{43})").matcher(mailer.sent.getFirst().body());
        assertThat(link.find()).isTrue();
        String newPassword = "a brand new passphrase for 2026";
        new TestBrowser(port).post("/api/v1/auth/password-reset/confirm", """
                {"token":"%s","password":"%s"}""".formatted(link.group(1), newPassword));

        assertThat(new TestBrowser(port).signIn(EMAIL, newPassword).body()).contains("\"secondStepRequired\":true");
    }

    // ---- Turning it off and new recovery codes -----------------------------------------------------------

    @Test
    void turningItOffNeedsThePasswordAndACode() throws Exception {
        Enabled enabled = enable(signedIn());
        mailer.sent.clear();
        TestBrowser browser = enabled.browser();
        String nextCode = Totp.code(enabled.secret(), enabled.usedStep() + 1);

        assertThat(browser.post("/api/v1/auth/2fa/totp/disable", passwordAndCode("not my password", nextCode)).body())
                .contains("currentPassword");
        assertThat(browser.post("/api/v1/auth/2fa/totp/disable", passwordAndCode(PASSWORD, "000000".equals(nextCode) ? "111111" : "000000")).body())
                .contains("invalid_code");

        HttpResponse<String> off = browser.post("/api/v1/auth/2fa/totp/disable", passwordAndCode(PASSWORD, nextCode));
        assertThat(off.statusCode()).isEqualTo(204);
        assertThat(status(browser)).contains("\"enabled\":false").contains("\"recoveryCodesLeft\":0");
        assertThat(mailer.sent).singleElement().satisfies(email -> assertThat(email.subject())
                .contains("Two-step verification turned off"));
        rateLimitFilter.reset();
        assertThat(new TestBrowser(port).signIn(EMAIL, PASSWORD).body()).contains("\"secondStepRequired\":false");
    }

    @Test
    void newRecoveryCodesReplaceTheOldOnes() throws Exception {
        Enabled enabled = enable(signedIn());

        HttpResponse<String> response = enabled.browser().post("/api/v1/auth/2fa/recovery-codes", password(PASSWORD));

        assertThat(response.statusCode()).isEqualTo(200);
        List<String> fresh = recoveryCodesIn(response);
        assertThat(fresh).hasSize(10).doesNotContainAnyElementsOf(enabled.recoveryCodes());
        TestBrowser browser = new TestBrowser(port);
        browser.signIn(EMAIL, PASSWORD);
        assertThat(secondStep(browser, enabled.recoveryCodes().getFirst()).statusCode()).as("old code").isEqualTo(400);
        assertThat(secondStep(browser, fresh.getFirst()).statusCode()).as("new code").isEqualTo(200);
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        TestBrowser browser = signedIn();
        String[] bodies = {"", "{", "[]", "{\"code\":[1]}", "{\"code\":\"" + "9".repeat(65) + "\"}", "{\"currentPassword\":null}"};
        for (String path : new String[] {
            "/api/v1/auth/login/2fa", "/api/v1/auth/2fa/totp/setup", "/api/v1/auth/2fa/totp/confirm",
            "/api/v1/auth/2fa/totp/disable", "/api/v1/auth/2fa/recovery-codes"
        }) {
            for (String body : bodies) {
                rateLimitFilter.reset();

                HttpResponse<String> response = browser.post(path, body);

                assertThat(response.statusCode()).as(path + " " + body).isEqualTo(400);
                assertThat(response.body()).as(path + " " + body).doesNotContainIgnoringCase("exception");
            }
        }
    }

    // ---- Helpers -------------------------------------------------------------------------------------------

    private TestBrowser signedIn() throws Exception {
        rateLimitFilter.reset();
        TestBrowser browser = new TestBrowser(port);
        assertThat(browser.signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        return browser;
    }

    private Enabled enable(TestBrowser browser) throws Exception {
        rateLimitFilter.reset();
        byte[] secret = Base32.decode(secretFrom(browser.post("/api/v1/auth/2fa/totp/setup", password(PASSWORD))));
        long step = Totp.stepAt(Instant.now());
        HttpResponse<String> confirmed = browser.post("/api/v1/auth/2fa/totp/confirm", code(Totp.code(secret, step)));
        assertThat(confirmed.statusCode()).isEqualTo(200);
        rateLimitFilter.reset();
        return new Enabled(browser, secret, step, recoveryCodesIn(confirmed));
    }

    private HttpResponse<String> secondStep(TestBrowser browser, String code) throws Exception {
        return browser.post("/api/v1/auth/login/2fa", code(code));
    }

    private String status(TestBrowser browser) throws Exception {
        return browser.get("/api/v1/auth/2fa").body();
    }

    private static String codeNow(byte[] secret) {
        return Totp.code(secret, Totp.stepAt(Instant.now()));
    }

    private static String password(String password) {
        return "{\"currentPassword\":\"" + password + "\"}";
    }

    private static String code(String code) {
        return "{\"code\":\"" + code + "\"}";
    }

    private static String passwordAndCode(String password, String code) {
        return "{\"currentPassword\":\"" + password + "\",\"code\":\"" + code + "\"}";
    }

    private static String secretFrom(HttpResponse<String> response) {
        Matcher matcher = SECRET.matcher(response.body());
        assertThat(matcher.find()).as(response.body()).isTrue();
        return matcher.group(1);
    }

    private static List<String> recoveryCodesIn(HttpResponse<String> response) {
        List<String> codes = new ArrayList<>();
        Matcher matcher = RECOVERY_CODE.matcher(response.body());
        while (matcher.find()) {
            codes.add(matcher.group());
        }
        return codes;
    }
}
