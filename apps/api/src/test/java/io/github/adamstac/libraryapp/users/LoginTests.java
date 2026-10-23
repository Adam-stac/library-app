package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
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
class LoginTests {

    static final String EMAIL = "reader@example.com";
    static final String PASSWORD = "correct horse battery staple 42";

    private final HttpClient client = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthRateLimitFilter rateLimitFilter;

    private UUID userId;

    @BeforeEach
    void createAccount() {
        rateLimitFilter.reset();
        jdbc.sql("DELETE FROM spring_session").update();
        jdbc.sql("DELETE FROM users").update();
        userId = UUID.randomUUID();
        jdbc.sql("INSERT INTO users (id, email, password_hash, preferred_language) VALUES (:id, :email, :hash, 'ar')")
                .param("id", userId)
                .param("email", EMAIL)
                .param("hash", passwordEncoder.encode(PASSWORD))
                .update();
    }

    /** Behaves like the web app: keeps cookies and echoes the CSRF cookie in the X-XSRF-TOKEN header. */
    class Browser {
        final Map<String, String> cookies = new LinkedHashMap<>();

        HttpResponse<String> send(String method, String path, String json, boolean withCsrfHeader) throws Exception {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
            if (!cookies.isEmpty()) {
                request.header("Cookie", cookies.entrySet().stream()
                        .map(cookie -> cookie.getKey() + "=" + cookie.getValue())
                        .collect(Collectors.joining("; ")));
            }
            if (withCsrfHeader && cookies.containsKey("XSRF-TOKEN")) {
                request.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
            }
            if (json != null) {
                request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(json));
            } else {
                request.method(method, HttpRequest.BodyPublishers.noBody());
            }
            HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            for (String header : response.headers().allValues("set-cookie")) {
                String pair = header.split(";", 2)[0];
                int equals = pair.indexOf('=');
                String name = pair.substring(0, equals);
                String value = pair.substring(equals + 1);
                if (value.isEmpty() || header.toLowerCase(Locale.ROOT).contains("max-age=0")) {
                    cookies.remove(name);
                } else {
                    cookies.put(name, value);
                }
            }
            return response;
        }

        HttpResponse<String> signIn(String email, String password) throws Exception {
            send("GET", "/api/v1/auth/csrf", null, false);
            return send("POST", "/api/v1/auth/login", """
                    {"email":"%s","password":"%s"}""".formatted(email, password), true);
        }
    }

    @Test
    void signingInCreatesASecureServerSideSession() throws Exception {
        Browser browser = new Browser();

        HttpResponse<String> response = browser.signIn(EMAIL, PASSWORD);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(EMAIL).contains("\"language\":\"ar\"").doesNotContainIgnoringCase("argon");
        String sessionCookie = response.headers().allValues("set-cookie").stream()
                .filter(header -> header.startsWith("__Host-SESSION="))
                .findFirst()
                .orElseThrow();
        assertThat(sessionCookie).contains("HttpOnly").contains("Secure").contains("SameSite=Lax").contains("Path=/");
        assertThat(browser.send("GET", "/api/v1/auth/me", null, false).body()).contains(EMAIL);
        assertThat(sessionsOf(userId)).isEqualTo(1);
    }

    @Test
    void aWrongPasswordAndAnUnknownEmailLookIdentical() throws Exception {
        HttpResponse<String> wrongPassword = new Browser().signIn(EMAIL, "not the right password at all");
        HttpResponse<String> unknownEmail = new Browser().signIn("nobody@example.com", PASSWORD);

        assertThat(wrongPassword.statusCode()).isEqualTo(400).isEqualTo(unknownEmail.statusCode());
        assertThat(wrongPassword.body()).contains("invalid_credentials").isEqualTo(unknownEmail.body());
        assertThat(wrongPassword.headers().allValues("set-cookie"))
                .noneMatch(header -> header.startsWith("__Host-SESSION="));
    }

    @Test
    void signingInWithoutTheCsrfTokenIsRefused() throws Exception {
        HttpResponse<String> response = new Browser().send("POST", "/api/v1/auth/login", """
                {"email":"%s","password":"%s"}""".formatted(EMAIL, PASSWORD), false);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(sessionsOf(userId)).isZero();
    }

    @Test
    void anAccountLocksForAWhileAfterFiveWrongPasswords() throws Exception {
        for (int i = 0; i < LoginService.MAX_FAILURES_BEFORE_LOCK; i++) {
            assertThat(new Browser().signIn(EMAIL, "wrong password number " + i).statusCode()).isEqualTo(400);
        }

        assertThat(new Browser().signIn(EMAIL, PASSWORD).statusCode())
                .as("locked, even with the right password")
                .isEqualTo(400);

        jdbc.sql("UPDATE users SET locked_until = now() - interval '1 second'").update();
        assertThat(new Browser().signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);
        assertThat(jdbc.sql("SELECT failed_logins FROM users").query(Integer.class).single()).isZero();
    }

    @Test
    void whoAmISaysNobodyWhenSignedOut() throws Exception {
        HttpResponse<String> response = new Browser().send("GET", "/api/v1/auth/me", null, false);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
    }

    @Test
    void signingOutEndsTheSessionOnTheServer() throws Exception {
        Browser browser = new Browser();
        browser.signIn(EMAIL, PASSWORD);
        String stolenCopy = browser.cookies.get("__Host-SESSION");
        browser.send("GET", "/api/v1/auth/me", null, false); // receives the fresh CSRF token

        HttpResponse<String> signOut = browser.send("POST", "/api/v1/auth/logout", null, true);

        assertThat(signOut.statusCode()).isEqualTo(204);
        assertThat(sessionsOf(userId)).isZero();
        Browser attacker = new Browser();
        attacker.cookies.put("__Host-SESSION", stolenCopy);
        assertThat(attacker.send("GET", "/api/v1/auth/me", null, false).statusCode())
                .as("a copied cookie stops working after sign-out")
                .isEqualTo(204);
    }

    @Test
    void aSessionIdChosenByAnAttackerIsNeverUsed() throws Exception {
        Browser browser = new Browser();
        browser.cookies.put("__Host-SESSION", "YXR0YWNrZXItY2hvc2Vu");

        assertThat(browser.signIn(EMAIL, PASSWORD).statusCode()).isEqualTo(200);

        assertThat(browser.cookies.get("__Host-SESSION")).isNotEqualTo("YXR0YWNrZXItY2hvc2Vu");
    }

    @Test
    void theCsrfTokenIsReplacedAfterSigningIn() throws Exception {
        Browser browser = new Browser();
        browser.send("GET", "/api/v1/auth/csrf", null, false);
        String before = browser.cookies.get("XSRF-TOKEN");

        browser.signIn(EMAIL, PASSWORD);
        browser.send("GET", "/api/v1/auth/me", null, false);

        assertThat(browser.cookies.get("XSRF-TOKEN")).isNotNull().isNotEqualTo(before);
    }

    @Test
    void malformedSignInRequestsAreRejectedCleanly() throws Exception {
        for (String body : new String[] {"", "{", "[]", "{\"email\":1}", "{\"email\":\"a@b.c\"}", "{\"password\":\"x\"}"}) {
            rateLimitFilter.reset();
            Browser browser = new Browser();
            browser.send("GET", "/api/v1/auth/csrf", null, false);

            HttpResponse<String> response = browser.send("POST", "/api/v1/auth/login", body, true);

            assertThat(response.statusCode()).as(body).isEqualTo(400);
            assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
        }
    }

    private long sessionsOf(UUID user) {
        return jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name = :name")
                .param("name", user.toString())
                .query(Long.class)
                .single();
    }
}
