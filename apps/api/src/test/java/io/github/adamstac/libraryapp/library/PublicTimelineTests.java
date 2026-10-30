package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The landing page's timeline (ADR 0010, slice T3): the catalogue's scholars for anyone, signed in or not. Reference
 * data only, the same for everyone; kept by the browser and checked again by ETag; limited per client address.
 * Threat model: book-lookup.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class PublicTimelineTests {

    static final String PUBLIC = "/api/v1/public/scholars";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void anyoneSeesTheSameScholarsAsSignedInReaders() throws Exception {
        HttpResponse<String> open = ApiBrowser.signedOut(port).get(PUBLIC);
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);
        reader.post("/api/v1/authors", "{\"nameAr\":\"البخاري\",\"wikidataId\":\"Q241026\"}");

        assertThat(open.statusCode()).isEqualTo(200);
        assertThat(open.body()).contains("\"id\":\"Q241026\"");
        // Nothing of a reader's own library is in it, and it is the list the general timeline shows
        assertThat(reader.get(PUBLIC).body()).isEqualTo(open.body());
        assertThat(reader.get(TimelineScholarsTests.SCHOLARS).body()).isEqualTo(open.body());
    }

    @Test
    void theBrowserKeepsItAndAsksAgainByETag() throws Exception {
        HttpResponse<String> first = send(HttpRequest.newBuilder(uri()).GET().build());

        assertThat(first.headers().firstValue("Cache-Control")).hasValue("max-age=3600, private");
        String etag = first.headers().firstValue("ETag").orElseThrow();
        HttpResponse<String> again =
                send(HttpRequest.newBuilder(uri()).header("If-None-Match", etag).GET().build());
        assertThat(again.statusCode()).isEqualTo(304);
        assertThat(again.body()).isEmpty();
    }

    @Test
    void onlyTheListCanBeReadThere() throws Exception {
        assertThat(send(HttpRequest.newBuilder(uri()).POST(HttpRequest.BodyPublishers.noBody()).build())
                        .statusCode())
                .isIn(401, 403);
        assertThat(ApiBrowser.signedOut(port).get("/api/v1/public/anything").statusCode()).isEqualTo(401);
        // A scholar's works and the rest of the reference data stay for signed-in readers
        assertThat(ApiBrowser.signedOut(port).get("/api/v1/reference/works?scholar=Q241026").statusCode())
                .isEqualTo(401);
    }

    private URI uri() {
        return URI.create("http://localhost:" + port + PUBLIC);
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
