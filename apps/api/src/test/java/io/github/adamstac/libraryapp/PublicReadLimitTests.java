package io.github.adamstac.libraryapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** The public reads (the landing page's timeline, slice T3) are limited per client address. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.rate-limit.public.requests-per-minute=3")
class PublicReadLimitTests {

    @Value("${local.server.port}")
    private int port;

    @Test
    void tooManyPublicReadsAreSlowedDown() throws Exception {
        ApiBrowser visitor = ApiBrowser.signedOut(port);
        for (int i = 0; i < 3; i++) {
            assertThat(visitor.get("/api/v1/public/scholars").statusCode()).isEqualTo(200);
        }

        HttpResponse<String> fourth = visitor.get("/api/v1/public/scholars");

        assertThat(fourth.statusCode()).isEqualTo(429);
        assertThat(fourth.headers().firstValue("Retry-After")).isPresent();
        assertThat(fourth.body()).isEqualTo("{\"status\":429,\"code\":\"rate_limited\"}");
        // Library reads and sign-in have their own limits, so a busy landing page never locks anyone out
        assertThat(visitor.get("/api/v1/auth/me").statusCode()).isEqualTo(204);
    }
}
