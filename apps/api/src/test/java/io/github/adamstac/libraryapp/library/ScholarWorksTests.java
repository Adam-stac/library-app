package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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
 * Finding a classical work in the scholars snapshot from Wikidata (ADR 0010, layer 2, slice L3), over real HTTP with
 * the snapshot that ships with the API. Threat model: book-lookup.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class ScholarWorksTests {

    static final String WORKS = "/api/v1/reference/works?q=";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void aClassicalWorkIsFoundByItsArabicTitleWithItsAuthorAndDeathYear() throws Exception {
        JsonNode first = items(newAccount(), "صحيح البخاري").get(0);

        assertThat(first.get("titleAr").asString()).isEqualTo("صحيح البخاري");
        JsonNode author = first.get("authors").get(0);
        assertThat(author.get("nameAr").asString()).contains("البخاري");
        assertThat(author.get("deathCe").asInt()).isEqualTo(870);
        assertThat(author.get("id").asString()).matches("Q[0-9]+");
    }

    @Test
    void aTypoAVariantSpellingOrATransliterationStillFindsIt() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(items(reader, "صحيج البخاري").get(0).get("titleAr").asString()).isEqualTo("صحيح البخاري");
        assertThat(items(reader, "صحيح البخارى").get(0).get("titleAr").asString()).isEqualTo("صحيح البخاري");
        assertThat(items(reader, "sahih bukhari").get(0).get("titleAr").asString()).isEqualTo("صحيح البخاري");
        assertThat(items(reader, "riyad salihin").get(0).get("titleAr").asString()).isEqualTo("رياض الصالحين");
    }

    @Test
    void wildcardsAreMatchedLiterally() throws Exception {
        ApiBrowser reader = newAccount();

        for (String text : new String[] {"%%%%", "____", "%_%_"}) {
            HttpResponse<String> answer = reader.get(WORKS + encode(text));
            assertThat(answer.statusCode()).as(text).isEqualTo(400); // no letters or digits to look for
        }
        // As a wildcard, ص%ح would match صحيح البخاري; taken literally it matches nothing
        HttpResponse<String> answer = reader.get(WORKS + encode("ص%ح"));
        assertThat(answer.statusCode()).isEqualTo(200);
        assertThat(answer.body()).isEqualTo("{\"items\":[]}");
    }

    @Test
    void theSearchTextIsChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.get("/api/v1/reference/works").statusCode()).isEqualTo(400);
        assertThat(reader.get(WORKS + "a").statusCode()).isEqualTo(400);
        assertThat(reader.get(WORKS + "a".repeat(101)).statusCode()).isEqualTo(400);
        HttpResponse<String> control = reader.get(WORKS + encode("صحيح‮البخاري"));
        assertThat(control.statusCode()).isEqualTo(400);
        assertThat(control.body()).doesNotContain("صحيح");
    }

    @Test
    void noMoreThanTenAreGiven() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(items(reader, "صحيح&limit=1000").size()).isEqualTo(10);
        assertThat(items(reader, "صحيح&limit=0").size()).isEqualTo(1);
    }

    @Test
    void everyReaderGetsTheSameAnswerAndNothingOfTheirsIsUsed() throws Exception {
        ApiBrowser one = newAccount();
        ApiBrowser two = newAccount();
        one.post("/api/v1/works", "{\"titleAr\":\"صحيح البخاري بخط يدي\"}");

        assertThat(one.get(WORKS + encode("صحيح البخاري")).body())
                .isEqualTo(two.get(WORKS + encode("صحيح البخاري")).body())
                .doesNotContain("بخط يدي");
    }

    @Test
    void searchingNeedsSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(WORKS + encode("صحيح البخاري")).statusCode()).isEqualTo(401);
    }

    // ---- Helpers -------------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private JsonNode items(ApiBrowser reader, String textAndMore) throws Exception {
        String[] parts = textAndMore.split("&", 2);
        String query = encode(parts[0]) + (parts.length > 1 ? "&" + parts[1] : "");
        HttpResponse<String> answer = reader.get(WORKS + query);
        assertThat(answer.statusCode()).as(answer.body()).isEqualTo(200);
        JsonNode items = json.readTree(answer.body()).get("items");
        assertThat(items.isEmpty()).as(textAndMore + " found nothing").isFalse();
        return items;
    }

    private static String encode(String text) {
        return URLEncoder.encode(text, StandardCharsets.UTF_8);
    }
}
