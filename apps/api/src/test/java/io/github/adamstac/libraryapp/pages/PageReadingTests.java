package io.github.adamstac.libraryapp.pages;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reading a book's cover or title page from a photo (ADR 0011), against a fake Google Cloud Vision. Threat model:
 * page-reading.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
@ExtendWith(OutputCaptureExtension.class)
class PageReadingTests {

    static final String READ = "/api/v1/page-readings";
    static final String KEY = "test-key-not-a-real-one-7f3a";
    static final FakeVision VISION = new FakeVision();

    /** The Mutammima's cover, as Google would read it */
    static final FakeVision.Line[] MUTAMMIMA = {
        new FakeVision.Line("مُتَمِّمَةُ الآجُرُّومِيَّة", 60, 100),
        new FakeVision.Line("في علم العربية", 40, 170),
        new FakeVision.Line("تأليف", 14, 230),
        new FakeVision.Line("العلامة شمس الدين محمد بن محمد الرعيني المالكي", 14, 250),
        new FakeVision.Line("الشهير بالحطاب", 14, 270),
        new FakeVision.Line("(٩٠٢ - ٩٥٤هـ)", 12, 290),
        new FakeVision.Line("تحقيق وتعليق", 12, 330),
        new FakeVision.Line("مالك بن سالم بن مطر المهذري", 14, 350),
        new FakeVision.Line("دار ابن حزم - بيروت", 16, 470),
    };

    @DynamicPropertySource
    static void reading(DynamicPropertyRegistry registry) {
        registry.add("app.page-reading.api-key", () -> KEY);
        registry.add("app.page-reading.endpoint", VISION::url);
        registry.add("app.page-reading.timeout-ms", () -> "1500");
    }

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void freshFake() {
        VISION.reset();
    }

    @Test
    void aCoverIsReadIntoFieldsWithEveryLineListed() throws Exception {
        VISION.reads(MUTAMMIMA);

        HttpResponse<String> answer = newAccount().postBytes(READ, jpeg(), "image/jpeg", true);

        assertThat(answer.statusCode()).as(answer.body()).isEqualTo(200);
        JsonNode fields = json.readTree(answer.body()).get("fields");
        assertThat(fields.get("title").asString()).isEqualTo("مُتَمِّمَةُ الآجُرُّومِيَّة في علم العربية");
        assertThat(fields.get("authors").get(0).asString()).endsWith("الشهير بالحطاب");
        assertThat(fields.get("authorDeathHijri").asInt()).isEqualTo(954);
        assertThat(fields.get("muhaqqiq").asString()).isEqualTo("مالك بن سالم بن مطر المهذري");
        assertThat(fields.get("publisher").asString()).isEqualTo("دار ابن حزم");
        assertThat(fields.get("publicationPlace").asString()).isEqualTo("بيروت");
        assertThat(json.readTree(answer.body()).get("lines").size()).isEqualTo(MUTAMMIMA.length);
    }

    @Test
    void onlyTheImageIsSentToTheVisionHostWithTheKeyInAHeader() throws Exception {
        VISION.reads(MUTAMMIMA);
        byte[] photo = jpeg();

        newAccount().postBytes(READ, photo, "image/jpeg", true);

        assertThat(VISION.requests()).hasSize(1);
        FakeVision.Request sent = VISION.requests().get(0);
        assertThat(sent.path()).isEqualTo("/v1/images:annotate");
        assertThat(sent.headers().get("X-goog-api-key")).containsExactly(KEY);
        assertThat(sent.headers().get("User-agent")).containsExactly(GoogleVisionReader.USER_AGENT);
        assertThat(sent.headers()).doesNotContainKeys("Cookie", "Authorization", "X-xsrf-token");
        JsonNode body = json.readTree(sent.body());
        JsonNode request = body.get("requests").get(0);
        assertThat(request.get("image").get("content").asString()).isEqualTo(Base64.getEncoder().encodeToString(photo));
        assertThat(request.get("features").get(0).get("type").asString()).isEqualTo("DOCUMENT_TEXT_DETECTION");
        // Nothing of the account, and the key never in the address
        assertThat(sent.body()).doesNotContain("@example.com");
        assertThat(sent.path()).doesNotContain(KEY);
    }

    @Test
    void readingNeedsSignInAndTheCsrfToken() throws Exception {
        assertThat(ApiBrowser.signedOut(port).postBytes(READ, jpeg(), "image/jpeg", true).statusCode())
                .isEqualTo(401);
        assertThat(newAccount().postBytes(READ, jpeg(), "image/jpeg", false).statusCode()).isEqualTo(403);
        assertThat(VISION.requests()).isEmpty();
    }

    @Test
    void onlyAJpegOrPngWithinTheLimitsIsAccepted() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.postBytes(READ, "not a photo".getBytes(), "image/jpeg", true).statusCode()).isEqualTo(400);
        assertThat(reader.postBytes(READ, image("gif", 800, 600), "image/jpeg", true).statusCode()).isEqualTo(400);
        assertThat(reader.postBytes(READ, image("jpg", 100, 100), "image/jpeg", true).statusCode()).isEqualTo(400);
        assertThat(reader.postBytes(READ, jpeg(), "image/gif", true).statusCode()).isEqualTo(415);
        assertThat(reader.postBytes(READ, new byte[5 * 1024 * 1024], "image/jpeg", true).statusCode())
                .isEqualTo(413);
        assertThat(reader.postBytes(READ, image("png", 800, 600), "image/png", true).statusCode()).isNotEqualTo(400);
        assertThat(VISION.requests()).hasSize(1); // only the PNG was passed on
    }

    @Test
    void aDecompressionBombIsRefusedBeforeDecoding() throws Exception {
        HttpResponse<String> answer = newAccount().postBytes(READ, pngClaiming(60_000, 60_000), "image/png", true);

        assertThat(answer.statusCode()).isEqualTo(400);
        assertThat(answer.body()).contains("too_large");
        assertThat(VISION.requests()).isEmpty();
    }

    @Test
    void hostileLinesAreDroppedOneByOne() throws Exception {
        VISION.reads(
                new FakeVision.Line("فتح الباري", 50, 10),
                new FakeVision.Line("شرح‮صحيح", 20, 70), // a direction override
                new FakeVision.Line("<script>alert(1)</script>", 20, 100),
                new FakeVision.Line("حققه: محمد فؤاد عبد الباقي", 14, 140));

        HttpResponse<String> answer = newAccount().postBytes(READ, jpeg(), "image/jpeg", true);

        JsonNode lines = json.readTree(answer.body()).get("lines");
        assertThat(lines.size()).isEqualTo(3);
        assertThat(answer.body()).doesNotContain("\\u202e", "‮");
        // Markup comes back as plain JSON text, for React to show as text
        assertThat(lines.get(1).asString()).isEqualTo("<script>alert(1)</script>");
        assertThat(json.readTree(answer.body()).get("fields").get("muhaqqiq").asString())
                .isEqualTo("محمد فؤاد عبد الباقي");
    }

    @Test
    void redirectsAreNotFollowedAndErrorsAreCodesOnly() throws Exception {
        ApiBrowser reader = newAccount();
        VISION.redirects("http://127.0.0.1:1/elsewhere");

        HttpResponse<String> redirected = reader.postBytes(READ, jpeg(), "image/jpeg", true);

        assertThat(redirected.statusCode()).isEqualTo(502);
        assertThat(redirected.body()).contains("\"code\":\"unavailable\"").doesNotContain("elsewhere");
        VISION.reset();
        VISION.answers(403, "{\"error\":{\"message\":\"API key not valid " + KEY + "\"}}");
        HttpResponse<String> refused = reader.postBytes(READ, jpeg(), "image/jpeg", true);
        assertThat(refused.statusCode()).isEqualTo(502);
        assertThat(refused.body()).doesNotContain(KEY, "API key");
    }

    @Test
    void anOversizedAnswerIsCutOff() throws Exception {
        VISION.answers(200, "{\"responses\":[{\"x\":\"" + "a".repeat(GoogleVisionReader.MAX_ANSWER_BYTES) + "\"}]}");

        HttpResponse<String> answer = newAccount().postBytes(READ, jpeg(), "image/jpeg", true);

        assertThat(answer.statusCode()).isEqualTo(502);
        assertThat(answer.body()).contains("\"code\":\"unavailable\"");
    }

    @Test
    void aSlowReadingIsCutOff() throws Exception {
        VISION.reads(MUTAMMIMA);
        VISION.waits(3000);

        long started = System.nanoTime();
        HttpResponse<String> answer = newAccount().postBytes(READ, jpeg(), "image/jpeg", true);

        assertThat(answer.statusCode()).isEqualTo(502);
        assertThat(answer.body()).contains("\"code\":\"timed_out\"");
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(2900);
    }

    @Test
    void nothingOfThePhotoIsKeptOrLoggedAndTheKeyNeverAppears(CapturedOutput output) throws Exception {
        VISION.reads(MUTAMMIMA);
        ApiBrowser reader = newAccount();

        HttpResponse<String> answer = reader.postBytes(READ, jpeg(), "image/jpeg", true);

        assertThat(answer.statusCode()).isEqualTo(200);
        // Only who asked, when and how it went
        assertThat(jdbc.sql("SELECT outcome FROM page_readings WHERE owner_id = :owner")
                        .param("owner", reader.accountId())
                        .query(String.class)
                        .list())
                .containsExactly("read");
        assertThat(jdbc.sql("SELECT column_name FROM information_schema.columns WHERE table_name = 'page_readings'")
                        .query(String.class)
                        .list())
                .containsExactlyInAnyOrder("id", "owner_id", "read_at", "outcome");
        assertThat(output.getAll()).contains("Page reading: read").doesNotContain("الحطاب", "المهذري", KEY);
        assertThat(answer.body()).doesNotContain(KEY);
        assertThat(reader.get(READ + "/status").body()).doesNotContain(KEY);
    }

    @Test
    void theStatusSaysItIsOnAndHowManyAreLeft() throws Exception {
        ApiBrowser reader = newAccount();
        VISION.reads(MUTAMMIMA);
        reader.postBytes(READ, jpeg(), "image/jpeg", true);

        JsonNode status = json.readTree(reader.get(READ + "/status").body());

        assertThat(status.get("enabled").asBoolean()).isTrue();
        assertThat(status.get("leftToday").asInt()).isEqualTo(29);
        assertThat(status.get("leftThisMonth").asInt()).isEqualTo(299);
        assertThat(status.get("paused").asBoolean()).isFalse();
        assertThat(ApiBrowser.signedOut(port).get(READ + "/status").statusCode()).isEqualTo(401);
    }

    // ---- Helpers -------------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    static byte[] jpeg() throws Exception {
        return image("jpg", 800, 600);
    }

    static byte[] image(String format, int width, int height) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), format, out);
        return out.toByteArray();
    }

    /** A PNG whose header claims a huge size, with almost no data: decoding it would take gigabytes */
    static byte[] pngClaiming(int width, int height) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
        ByteBuffer header = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 8).put((byte) 2);
        chunk(out, "IHDR", header.array());
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void chunk(ByteArrayOutputStream out, String type, byte[] data) throws Exception {
        out.write(ByteBuffer.allocate(4).putInt(data.length).array());
        byte[] name = type.getBytes();
        out.write(name);
        out.write(data);
        CRC32 crc = new CRC32();
        crc.update(name);
        crc.update(data);
        out.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }
}
