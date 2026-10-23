package io.github.adamstac.libraryapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** Starts the real app with a real Postgres (Testcontainers) and checks security from the outside. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SecurityBaselineTests {

    private final HttpClient client = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthCheckIsPublicAndUp() throws Exception {
        HttpResponse<String> response = get("/actuator/health");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"");
    }

    @Test
    void everythingElseIsDeniedByDefault() throws Exception {
        assertThat(get("/").statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/authors").statusCode()).isEqualTo(401);
        assertThat(get("/actuator/env").statusCode()).isEqualTo(401);
    }

    @Test
    void responsesCarrySecurityHeaders() throws Exception {
        var headers = get("/actuator/health").headers();
        assertThat(headers.firstValue("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(headers.firstValue("X-Frame-Options")).hasValue("DENY");
        assertThat(headers.firstValue("Content-Security-Policy"))
                .hasValue("default-src 'none'; frame-ancestors 'none'");
        assertThat(headers.firstValue("Referrer-Policy")).hasValue("no-referrer");
    }

    @Test
    void errorsDoNotLeakInternals() throws Exception {
        HttpResponse<String> response = get("/actuator/health/does-not-exist");
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).doesNotContain("trace").doesNotContainIgnoringCase("exception");
    }
}
