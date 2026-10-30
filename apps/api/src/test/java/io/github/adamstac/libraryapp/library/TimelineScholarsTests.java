package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The general scholars timeline (ADR 0010, slice T2): every scholar in the catalogue with a known year of death, the
 * same for every reader, and a scholar's own works for their card. Uses the snapshot that ships with the API.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class TimelineScholarsTests {

    static final String SCHOLARS = "/api/v1/timeline/scholars";
    /** al-Bukhari on Wikidata */
    static final String BUKHARI = "Q241026";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void everyDatedScholarIsListedWithTheirWorksCount() throws Exception {
        HttpResponse<String> answer = newAccount().get(SCHOLARS);

        assertThat(answer.statusCode()).isEqualTo(200);
        JsonNode scholars = json.readTree(answer.body()).get("scholars");
        assertThat(scholars.size()).isGreaterThan(1000);
        JsonNode bukhari = null;
        for (JsonNode scholar : scholars) {
            assertThat(scholar.get("deathHijri").isNull() && scholar.get("deathCe").isNull()).isFalse();
            if (BUKHARI.equals(scholar.get("id").asString())) {
                bukhari = scholar;
            }
        }
        assertThat(bukhari).isNotNull();
        assertThat(bukhari.get("deathCe").asInt()).isEqualTo(870);
        assertThat(bukhari.get("works").asInt()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void everyReaderGetsTheSameList() throws Exception {
        ApiBrowser one = newAccount();
        one.post("/api/v1/authors", "{\"nameAr\":\"البخاري\",\"wikidataId\":\"" + BUKHARI + "\"}");

        assertThat(one.get(SCHOLARS).body()).isEqualTo(newAccount().get(SCHOLARS).body());
    }

    @Test
    void aScholarsCardShowsTheirWorks() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> answer = reader.get("/api/v1/reference/works?scholar=" + BUKHARI + "&limit=3");

        assertThat(answer.statusCode()).isEqualTo(200);
        JsonNode items = json.readTree(answer.body()).get("items");
        assertThat(items.size()).isBetween(1, 3);
        assertThat(answer.body()).contains("\"titleAr\":\"صحيح البخاري\"");
    }

    @Test
    void theScholarIsCheckedAndNeverEchoed() throws Exception {
        ApiBrowser reader = newAccount();

        for (String bad : new String[] {"Q0", "nope", "Q1%25", "<b>"}) {
            HttpResponse<String> answer = reader.get("/api/v1/reference/works?scholar=" + bad);
            assertThat(answer.statusCode()).as(bad).isEqualTo(400);
            assertThat(answer.body()).doesNotContain("nope", "<b>");
        }
        assertThat(reader.get("/api/v1/reference/works?scholar=" + BUKHARI + "&q=bukhari").statusCode()).isEqualTo(400);
        // A scholar with no works in the catalogue: an empty list, not an error
        assertThat(reader.get("/api/v1/reference/works?scholar=Q999999999999").body()).isEqualTo("{\"items\":[]}");
    }

    @Test
    void yourOwnAuthorsCarryTheirLinkOnTheTimeline() throws Exception {
        ApiBrowser reader = newAccount();
        reader.post("/api/v1/authors", "{\"nameAr\":\"البخاري\",\"death\":{\"ce\":870},\"wikidataId\":\"" + BUKHARI + "\"}");

        assertThat(reader.get("/api/v1/timeline").body()).contains("\"wikidataId\":\"" + BUKHARI + "\"");
    }

    @Test
    void scholarsNeedSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(SCHOLARS).statusCode()).isEqualTo(401);
    }

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }
}
