package io.github.adamstac.libraryapp.pages;

import io.github.adamstac.libraryapp.UpstreamException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads a page with Google Cloud Vision's document text detection (ADR 0011). Only the image is sent, from the
 * server, to one fixed host: no account, cookie or session, a fixed User-Agent, the key in a header (never in the
 * address, so it can't land in a log). No redirects are followed, the answer is cut off past a size limit, and the
 * whole call has a timeout. The answer is untrusted: TitlePage and the service check every line.
 */
@Component
class GoogleVisionReader implements PageReader {

    private static final Logger log = LoggerFactory.getLogger(GoogleVisionReader.class);
    static final int MAX_ANSWER_BYTES = 2 * 1024 * 1024;
    static final String USER_AGENT = "Khizana/1 (+https://github.com/Adam-stac/library-app)";

    // Google's answer, as far as it is used; anything else in it is ignored
    record Answer(List<Response> responses) {}

    record Response(FullText fullTextAnnotation, Problem error) {}

    record Problem(Integer code) {}

    record FullText(List<Page> pages) {}

    record Page(List<Block> blocks) {}

    record Block(List<Paragraph> paragraphs) {}

    record Paragraph(List<Word> words) {}

    record Word(Box boundingBox, List<Symbol> symbols) {}

    record Symbol(String text, Property property) {}

    record Property(Break detectedBreak) {}

    record Break(String type) {}

    record Box(List<Vertex> vertices) {}

    record Vertex(Integer x, Integer y) {}

    private final String key;
    private final URI address;
    private final Duration timeout;
    private final HttpClient client;
    private final JsonMapper json = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    GoogleVisionReader(
            @Value("${app.page-reading.api-key:}") String key,
            @Value("${app.page-reading.endpoint}") String endpoint,
            @Value("${app.page-reading.timeout-ms}") long timeoutMillis) {
        this.key = key == null ? "" : key.strip();
        URI base = URI.create(endpoint.endsWith("/") ? endpoint : endpoint + "/");
        String host = base.getHost() == null ? "" : base.getHost().toLowerCase(Locale.ROOT);
        boolean local = host.equals("localhost") || host.equals("127.0.0.1");
        if (!"https".equals(base.getScheme()) && !local) {
            throw new IllegalStateException("app.page-reading.endpoint must use https"); // only a test's fake is http
        }
        this.address = base.resolve("v1/images:annotate");
        this.timeout = Duration.ofMillis(timeoutMillis);
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(timeoutMillis, 3000)))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public boolean enabled() {
        return !key.isEmpty();
    }

    @Override
    public List<TitlePage.Line> read(byte[] image) {
        String body = "{\"requests\":[{\"image\":{\"content\":\"" + Base64.getEncoder().encodeToString(image)
                + "\"},\"features\":[{\"type\":\"DOCUMENT_TEXT_DETECTION\"}],"
                + "\"imageContext\":{\"languageHints\":[\"ar\",\"en\"]}}]}";
        HttpRequest request = HttpRequest.newBuilder(address)
                .timeout(timeout)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("x-goog-api-key", key)
                .header("User-Agent", USER_AGENT)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        byte[] answer;
        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = response.body()) {
                if (response.statusCode() != 200) {
                    // A redirect, a refused key, a quota: nothing followed, nothing of the answer kept
                    log.warn("Page reading: the reading service answered HTTP {}", response.statusCode());
                    throw new UpstreamException("unavailable");
                }
                answer = in.readNBytes(MAX_ANSWER_BYTES + 1);
            }
        } catch (HttpTimeoutException e) {
            log.warn("Page reading: the reading service took too long");
            throw new UpstreamException("timed_out");
        } catch (IOException e) {
            log.warn("Page reading: the reading service couldn't be reached ({})", e.getClass().getSimpleName());
            throw new UpstreamException("unavailable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UpstreamException("timed_out");
        }
        if (answer.length > MAX_ANSWER_BYTES) {
            log.warn("Page reading: the answer was too large and was dropped");
            throw new UpstreamException("unavailable");
        }
        try {
            return lines(json.readValue(answer, Answer.class));
        } catch (RuntimeException e) {
            log.warn("Page reading: the answer couldn't be understood");
            throw new UpstreamException("unavailable");
        }
    }

    /** The lines on the page, in Google's reading order, each with the height and top of the words on it. */
    static List<TitlePage.Line> lines(Answer answer) {
        List<TitlePage.Line> lines = new ArrayList<>();
        if (answer == null || answer.responses() == null || answer.responses().isEmpty()) {
            return lines;
        }
        Response response = answer.responses().get(0);
        if (response == null || response.error() != null || response.fullTextAnnotation() == null) {
            if (response != null && response.error() != null) {
                throw new UpstreamException("unavailable");
            }
            return lines;
        }
        StringBuilder text = new StringBuilder();
        double[] box = emptyBox();
        for (Page page : list(response.fullTextAnnotation().pages())) {
            for (Block block : list(page.blocks())) {
                for (Paragraph paragraph : list(block.paragraphs())) {
                    for (Word word : list(paragraph.words())) {
                        grow(box, word.boundingBox());
                        for (Symbol symbol : list(word.symbols())) {
                            if (symbol.text() != null) {
                                text.append(symbol.text());
                            }
                            String kind = symbol.property() == null || symbol.property().detectedBreak() == null
                                    ? null
                                    : symbol.property().detectedBreak().type();
                            if ("SPACE".equals(kind) || "SURE_SPACE".equals(kind)) {
                                text.append(' ');
                            } else if ("EOL_SURE_SPACE".equals(kind) || "LINE_BREAK".equals(kind)) {
                                end(lines, text, box);
                                box = emptyBox();
                            }
                        }
                    }
                    end(lines, text, box); // a paragraph always ends a line
                    box = emptyBox();
                }
            }
        }
        return lines;
    }

    private static void end(List<TitlePage.Line> lines, StringBuilder text, double[] box) {
        String line = text.toString().strip();
        text.setLength(0);
        if (!line.isEmpty()) {
            double height = box[3] >= box[1] ? box[3] - box[1] : 0;
            lines.add(new TitlePage.Line(line, height, box[1] == Double.MAX_VALUE ? 0 : box[1]));
        }
    }

    /** minX, minY, maxX, maxY */
    private static double[] emptyBox() {
        return new double[] {Double.MAX_VALUE, Double.MAX_VALUE, -1, -1};
    }

    private static void grow(double[] box, Box bound) {
        if (bound == null || bound.vertices() == null) {
            return;
        }
        for (Vertex v : bound.vertices()) {
            if (v == null) {
                continue;
            }
            double x = v.x() == null ? 0 : v.x(); // Google leaves out a coordinate that is 0
            double y = v.y() == null ? 0 : v.y();
            box[0] = Math.min(box[0], x);
            box[1] = Math.min(box[1], y);
            box[2] = Math.max(box[2], x);
            box[3] = Math.max(box[3], y);
        }
    }

    private static <T> List<T> list(List<T> items) {
        return items == null ? List.of() : items;
    }
}
