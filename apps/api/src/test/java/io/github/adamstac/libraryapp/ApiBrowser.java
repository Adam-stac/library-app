package io.github.adamstac.libraryapp;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * A signed-in browser for the library's tests (authors, places, works and editions). Behaves like the web app:
 * keeps cookies, and echoes the CSRF cookie in the X-XSRF-TOKEN header on every change.
 */
public class ApiBrowser {

    public static final String PASSWORD = "correct horse battery staple 42";

    /**
     * For {@code @SpringBootTest(properties = ...)}: library tests sign in many accounts, so the per-IP sign-in
     * limit (10 a minute in production) is raised. Every library test class uses this same value, so they share
     * one Spring context and one database container.
     */
    public static final String MANY_SIGN_INS = "app.rate-limit.auth.requests-per-minute=100000";

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    private final Map<String, String> cookies = new LinkedHashMap<>();
    private final int port;
    private final UUID accountId;
    private final String email;

    private ApiBrowser(int port, UUID accountId, String email) {
        this.port = port;
        this.accountId = accountId;
        this.email = email;
    }

    /** Nobody signed in. */
    public static ApiBrowser signedOut(int port) {
        return new ApiBrowser(port, null, null);
    }

    /** Creates a new account and signs in to it. */
    public static ApiBrowser newAccount(int port, JdbcClient jdbc, PasswordEncoder passwordEncoder) throws Exception {
        UUID id = UUID.randomUUID();
        String email = "reader-" + id + "@example.com";
        jdbc.sql("INSERT INTO users (id, email, password_hash, preferred_language) VALUES (:id, :email, :hash, 'en')")
                .param("id", id)
                .param("email", email)
                .param("hash", passwordEncoder.encode(PASSWORD))
                .update();
        return new ApiBrowser(port, id, email).signIn();
    }

    /** The same account, signed in on a second device. */
    public ApiBrowser anotherDevice() throws Exception {
        return new ApiBrowser(port, accountId, email).signIn();
    }

    private ApiBrowser signIn() throws Exception {
        HttpResponse<String> signIn = post("/api/v1/auth/login", """
                {"email":"%s","password":"%s"}""".formatted(email, PASSWORD));
        if (signIn.statusCode() != 200) {
            throw new IllegalStateException("Signing in failed: " + signIn.statusCode() + " " + signIn.body());
        }
        return this;
    }

    public UUID accountId() {
        return accountId;
    }

    public HttpResponse<String> get(String path) throws Exception {
        return send("GET", path, null, null, false);
    }

    public HttpResponse<String> post(String path, String json) throws Exception {
        return send("POST", path, json, null, true);
    }

    /** An edit: {@code version} is the ETag of what was read, sent back in If-Match. */
    public HttpResponse<String> put(String path, String json, String version) throws Exception {
        return send("PUT", path, json, version, true);
    }

    public HttpResponse<String> delete(String path) throws Exception {
        return send("DELETE", path, null, null, true);
    }

    /** Sends any request; {@code withCsrf} false leaves out the CSRF header, like a request from another site. */
    public HttpResponse<String> send(String method, String path, String json, String ifMatch, boolean withCsrf)
            throws Exception {
        return send(method, path, json, "application/json", ifMatch, withCsrf);
    }

    /** Sends a body of any content type. */
    public HttpResponse<String> send(
            String method, String path, String body, String contentType, String ifMatch, boolean withCsrf)
            throws Exception {
        if (withCsrf && !cookies.containsKey("XSRF-TOKEN")) {
            send("GET", "/api/v1/auth/csrf", null, null, false);
        }
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (!cookies.isEmpty()) {
            request.header("Cookie", cookies.entrySet().stream()
                    .map(cookie -> cookie.getKey() + "=" + cookie.getValue())
                    .collect(Collectors.joining("; ")));
        }
        if (withCsrf && cookies.containsKey("XSRF-TOKEN")) {
            request.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
        }
        if (ifMatch != null) {
            request.header("If-Match", ifMatch);
        }
        if (body != null) {
            request.header("Content-Type", contentType).method(method, HttpRequest.BodyPublishers.ofString(body));
        } else {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        }
        HttpResponse<String> response = CLIENT.send(request.build(), HttpResponse.BodyHandlers.ofString());
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
}
