package io.github.adamstac.libraryapp.users;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/** Behaves like the web app: keeps cookies and echoes the CSRF cookie in the X-XSRF-TOKEN header. */
class TestBrowser {

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    final Map<String, String> cookies = new LinkedHashMap<>();
    private final int port;

    TestBrowser(int port) {
        this.port = port;
    }

    HttpResponse<String> get(String path) throws Exception {
        return send("GET", path, null, false);
    }

    /** POSTs JSON with the CSRF token, fetching one first if needed. */
    HttpResponse<String> post(String path, String json) throws Exception {
        if (!cookies.containsKey("XSRF-TOKEN")) {
            get("/api/v1/auth/csrf");
        }
        return send("POST", path, json, true);
    }

    HttpResponse<String> signIn(String email, String password) throws Exception {
        return post("/api/v1/auth/login", """
                {"email":"%s","password":"%s"}""".formatted(email, password));
    }

    boolean isSignedIn() throws Exception {
        return get("/api/v1/auth/me").statusCode() == 200;
    }

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
