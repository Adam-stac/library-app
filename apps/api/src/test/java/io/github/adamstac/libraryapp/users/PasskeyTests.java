package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.users.RegistrationTests.RecordingMailer;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
class PasskeyTests {

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

    // ---- Adding passkeys ----------------------------------------------------------------------------------

    @Test
    void addingAPasskeyNeedsThePasswordAndStoresOnlyThePublicKey() throws Exception {
        TestBrowser browser = signedIn();

        HttpResponse<String> wrongPassword = browser.post("/api/v1/auth/passkeys/register/options", password("not it"));
        assertThat(wrongPassword.statusCode()).isEqualTo(400);
        assertThat(wrongPassword.body()).contains("currentPassword").contains("incorrect");

        HttpResponse<String> options = browser.post("/api/v1/auth/passkeys/register/options", password(PASSWORD));
        assertThat(options.statusCode()).isEqualTo(200);
        assertThat(options.body())
                .contains("\"id\":\"localhost\"")
                .contains("\"userVerification\":\"required\"")
                .contains("\"residentKey\":\"required\"")
                .contains("\"attestation\":\"none\"");

        TestAuthenticator authenticator = new TestAuthenticator();
        HttpResponse<String> added = register(browser, authenticator, map(options), "Laptop");

        assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
        assertThat(added.body()).contains("\"label\":\"Laptop\"");
        assertThat(browser.get("/api/v1/auth/passkeys").body()).contains("Laptop");
        assertThat(jdbc.sql("SELECT count(*) FROM passkeys").query(Long.class).single()).isEqualTo(1);
        byte[] handle = jdbc.sql("SELECT webauthn_user_handle FROM users").query(byte[].class).single();
        assertThat(handle).as("a random handle, not the email or account ID").hasSize(32);
        assertThat(mailer.sent).singleElement().satisfies(email -> {
            assertThat(email.subject()).contains("A passkey was added");
            assertThat(email.body()).contains("Laptop");
        });
    }

    @Test
    void theSamePasskeyCantBeAddedTwice() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator authenticator = new TestAuthenticator();
        assertThat(register(browser, authenticator, startRegistration(browser), "Phone").statusCode()).isEqualTo(201);

        HttpResponse<String> again = register(browser, authenticator, startRegistration(browser), "Phone again");

        assertThat(again.statusCode()).isEqualTo(400);
        assertThat(again.body()).contains("passkey_already_registered");
    }

    @Test
    void aPasskeyMadeForAnotherWebsiteIsRejected() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator phished = new TestAuthenticator();
        phished.origin = "https://my-library.example.evil";

        HttpResponse<String> response = register(browser, phished, startRegistration(browser), "Phished");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("invalid_passkey");
    }

    @Test
    void aPasskeyWithoutFingerprintFaceOrPinIsRejected() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator unverified = new TestAuthenticator();
        unverified.userVerified = false;

        assertThat(register(browser, unverified, startRegistration(browser), "No PIN").statusCode()).isEqualTo(400);
    }

    @Test
    void finishingWithoutStartingIsRefused() throws Exception {
        TestBrowser browser = signedIn();
        Map<String, Object> options = startRegistration(browser);
        TestAuthenticator authenticator = new TestAuthenticator();
        Map<String, Object> credential = authenticator.create(options);
        assertThat(finishRegistration(browser, credential, "First").statusCode()).isEqualTo(201);

        HttpResponse<String> replayed = finishRegistration(browser, credential, "Replayed");

        assertThat(replayed.statusCode()).as("each challenge works once").isEqualTo(400);
        assertThat(replayed.body()).contains("start_again");
    }

    @Test
    void managingPasskeysNeedsSignIn() throws Exception {
        TestBrowser anonymous = new TestBrowser(port);

        assertThat(anonymous.get("/api/v1/auth/passkeys").statusCode()).isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/passkeys/register/options", password(PASSWORD)).statusCode())
                .isEqualTo(401);
        assertThat(anonymous.post("/api/v1/auth/passkeys/" + UUID.randomUUID() + "/delete", password(PASSWORD))
                        .statusCode())
                .isEqualTo(401);
    }

    // ---- Signing in with a passkey ------------------------------------------------------------------------

    @Test
    void signingInWithAPasskeyNeedsNoPasswordAndStartsAFreshSession() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        TestBrowser browser = new TestBrowser(port);

        Map<String, Object> options = startSignIn(browser);
        assertThat(options).containsEntry("rpId", "localhost").containsEntry("userVerification", "required");
        String sessionBefore = browser.cookies.get("__Host-SESSION");
        HttpResponse<String> response = finishSignIn(browser, authenticator.get(options));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(response.body()).contains(EMAIL).contains("\"secondStepRequired\":false");
        assertThat(browser.isSignedIn()).isTrue();
        assertThat(browser.cookies.get("__Host-SESSION")).isNotEqualTo(sessionBefore);
        assertThat(jdbc.sql("SELECT last_used_at IS NOT NULL FROM passkeys").query(Boolean.class).single()).isTrue();
    }

    @Test
    void edDsaPasskeysWorkToo() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator authenticator = new TestAuthenticator(true);
        assertThat(register(browser, authenticator, startRegistration(browser), "Chrome").statusCode()).isEqualTo(201);
        rateLimitFilter.reset();

        TestBrowser later = new TestBrowser(port);
        assertThat(finishSignIn(later, authenticator.get(startSignIn(later))).statusCode()).isEqualTo(200);
    }

    @Test
    void aSignInAnswerWorksOnlyOnce() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        TestBrowser browser = new TestBrowser(port);
        Map<String, Object> answer = authenticator.get(startSignIn(browser));
        assertThat(finishSignIn(browser, answer).statusCode()).isEqualTo(200);

        TestBrowser attacker = new TestBrowser(port);
        startSignIn(attacker); // a fresh challenge that the copied answer doesn't match

        HttpResponse<String> replayed = finishSignIn(attacker, answer);
        assertThat(replayed.statusCode()).isEqualTo(400);
        assertThat(replayed.body()).contains("invalid_passkey");
        assertThat(attacker.isSignedIn()).isFalse();
    }

    @Test
    void aSignInAnswerForAnotherWebsiteIsRejected() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        authenticator.origin = "https://my-library.example.evil";
        TestBrowser browser = new TestBrowser(port);

        assertThat(finishSignIn(browser, authenticator.get(startSignIn(browser))).statusCode()).isEqualTo(400);
        assertThat(browser.isSignedIn()).isFalse();
    }

    @Test
    void aTamperedSignatureIsRejected() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        authenticator.tamperSignature = true;
        TestBrowser browser = new TestBrowser(port);

        assertThat(finishSignIn(browser, authenticator.get(startSignIn(browser))).statusCode()).isEqualTo(400);
    }

    @Test
    void signingInWithoutFingerprintFaceOrPinIsRejected() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        authenticator.userVerified = false;
        TestBrowser browser = new TestBrowser(port);

        assertThat(finishSignIn(browser, authenticator.get(startSignIn(browser))).statusCode()).isEqualTo(400);
    }

    @Test
    void aClonedPasskeyIsCaughtByItsCounter() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        authenticator.counter = 10;
        TestBrowser first = new TestBrowser(port);
        assertThat(finishSignIn(first, authenticator.get(startSignIn(first))).statusCode()).isEqualTo(200);

        authenticator.counter = 3; // a copy of the key that has fallen behind
        TestBrowser second = new TestBrowser(port);

        assertThat(finishSignIn(second, authenticator.get(startSignIn(second))).statusCode()).isEqualTo(400);
    }

    @Test
    void anUnknownPasskeyIsRejected() throws Exception {
        registeredPasskey();
        TestAuthenticator stranger = new TestAuthenticator();
        stranger.create(Map.of("challenge", "x", "user", Map.of("id", "AAAA")));
        TestBrowser browser = new TestBrowser(port);

        assertThat(finishSignIn(browser, stranger.get(startSignIn(browser))).statusCode()).isEqualTo(400);
    }

    @Test
    void aLockedAccountCantSignInWithAPasskey() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        jdbc.sql("UPDATE users SET locked_until = now() + interval '15 minutes'").update();
        TestBrowser browser = new TestBrowser(port);

        assertThat(finishSignIn(browser, authenticator.get(startSignIn(browser))).statusCode()).isEqualTo(400);
    }

    @Test
    void signingInWithoutStartingIsRefused() throws Exception {
        TestAuthenticator authenticator = registeredPasskey();
        TestBrowser browser = new TestBrowser(port);

        HttpResponse<String> response = finishSignIn(browser, authenticator.get(Map.of("challenge", "AAAA")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("start_again");
    }

    // ---- Removing passkeys --------------------------------------------------------------------------------

    @Test
    void removingAPasskeyNeedsThePasswordAndStopsItWorking() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator authenticator = new TestAuthenticator();
        register(browser, authenticator, startRegistration(browser), "Old phone");
        String id = firstItem(browser.get("/api/v1/auth/passkeys")).get("id").toString();
        mailer.sent.clear();

        assertThat(browser.post("/api/v1/auth/passkeys/" + id + "/delete", password("not it")).statusCode())
                .isEqualTo(400);
        HttpResponse<String> removed = browser.post("/api/v1/auth/passkeys/" + id + "/delete", password(PASSWORD));

        assertThat(removed.statusCode()).isEqualTo(204);
        assertThat(mailer.sent).singleElement().satisfies(email -> assertThat(email.subject())
                .contains("A passkey was removed"));
        rateLimitFilter.reset();
        TestBrowser later = new TestBrowser(port);
        assertThat(finishSignIn(later, authenticator.get(startSignIn(later))).statusCode()).isEqualTo(400);
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        TestBrowser browser = signedIn();
        String[] bodies = {
            "", "{", "[]", "{\"credential\":null}", "{\"credential\":[1]}", "{\"credential\":{\"id\":1}}",
            "{\"label\":\"x\\u0007\",\"credential\":{}}", "{\"label\":\"" + "x".repeat(65) + "\",\"credential\":{}}"
        };
        for (String path : new String[] {"/api/v1/auth/passkeys/register", "/api/v1/auth/passkeys/login"}) {
            for (String body : bodies) {
                rateLimitFilter.reset();
                if (path.endsWith("login")) {
                    startSignIn(browser);
                } else {
                    startRegistration(browser);
                }

                HttpResponse<String> response = browser.post(path, body);

                assertThat(response.statusCode()).as(path + " " + body).isEqualTo(400);
                assertThat(response.body()).as(path + " " + body).doesNotContainIgnoringCase("exception");
            }
        }
    }

    // ---- Helpers ------------------------------------------------------------------------------------------

    private TestBrowser signedIn() throws Exception {
        rateLimitFilter.reset();
        TestBrowser browser = new TestBrowser(port);
        assertThat(browser.signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        return browser;
    }

    private TestAuthenticator registeredPasskey() throws Exception {
        TestBrowser browser = signedIn();
        TestAuthenticator authenticator = new TestAuthenticator();
        HttpResponse<String> added = register(browser, authenticator, startRegistration(browser), "Phone");
        assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
        mailer.sent.clear();
        rateLimitFilter.reset();
        return authenticator;
    }

    private Map<String, Object> startRegistration(TestBrowser browser) throws Exception {
        HttpResponse<String> options = browser.post("/api/v1/auth/passkeys/register/options", password(PASSWORD));
        assertThat(options.statusCode()).as(options.body()).isEqualTo(200);
        return map(options);
    }

    private HttpResponse<String> register(
            TestBrowser browser, TestAuthenticator authenticator, Map<String, Object> options, String label)
            throws Exception {
        return finishRegistration(browser, authenticator.create(options), label);
    }

    private HttpResponse<String> finishRegistration(TestBrowser browser, Map<String, Object> credential, String label)
            throws Exception {
        return browser.post("/api/v1/auth/passkeys/register", JSON.writeValueAsString(
                Map.of("label", label, "credential", credential)));
    }

    private Map<String, Object> startSignIn(TestBrowser browser) throws Exception {
        HttpResponse<String> options = browser.post("/api/v1/auth/passkeys/login/options", null);
        assertThat(options.statusCode()).as(options.body()).isEqualTo(200);
        return map(options);
    }

    private HttpResponse<String> finishSignIn(TestBrowser browser, Map<String, Object> credential) throws Exception {
        return browser.post("/api/v1/auth/passkeys/login", JSON.writeValueAsString(Map.of("credential", credential)));
    }

    private static String password(String password) {
        return "{\"currentPassword\":\"" + password + "\"}";
    }

    private static Map<String, Object> map(HttpResponse<String> response) {
        return JSON.readValue(response.body(), new TypeReference<Map<String, Object>>() {});
    }

    /** The first item of a JSON array response. */
    private static Map<String, Object> firstItem(HttpResponse<String> response) {
        return JSON.readValue(response.body(), new TypeReference<List<Map<String, Object>>>() {}).getFirst();
    }
}
