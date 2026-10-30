package io.github.adamstac.libraryapp.authors;

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

/**
 * An author's link to a scholar in the reference data, by Wikidata ID (ADR 0010, slice T2): set when the author is
 * added from the catalogue or the timeline, never removed by an edit, one author per scholar per account. Threat
 * model: library.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class AuthorScholarLinkTests {

    static final String AUTHORS = "/api/v1/authors";
    static final String BUKHARI = "{\"nameAr\":\"البخاري\",\"death\":{\"ce\":870},\"wikidataId\":\"Q241026\"}";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void anAuthorAddedFromTheCatalogueKeepsTheScholarsId() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> added = reader.post(AUTHORS, BUKHARI);

        assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
        assertThat(added.body()).contains("\"wikidataId\":\"Q241026\"");
        String path = AUTHORS + "/" + AuthorTests.idOf(added.body());
        assertThat(reader.get(path).body()).contains("\"wikidataId\":\"Q241026\"");
    }

    @Test
    void editingAnAuthorNeverRemovesTheLink() throws Exception {
        ApiBrowser reader = newAccount();
        String path = AUTHORS + "/" + AuthorTests.idOf(reader.post(AUTHORS, BUKHARI).body());

        // The author form doesn't know about the link, so it sends none
        HttpResponse<String> edited = reader.put(path, "{\"nameAr\":\"الإمام البخاري\",\"death\":{\"ce\":870}}", "\"0\"");

        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.body()).contains("\"nameAr\":\"الإمام البخاري\"", "\"wikidataId\":\"Q241026\"");
    }

    @Test
    void aScholarCanBeInYourLibraryOnlyOnce() throws Exception {
        ApiBrowser reader = newAccount();
        assertThat(reader.post(AUTHORS, BUKHARI).statusCode()).isEqualTo(201);

        HttpResponse<String> again = reader.post(AUTHORS, BUKHARI);
        assertThat(again.statusCode()).isEqualTo(409);
        assertThat(again.body()).contains("already_in_library");

        // Linking another author to the same scholar by an edit is refused the same way
        String other = AUTHORS + "/" + AuthorTests.idOf(reader.post(AUTHORS, "{\"nameAr\":\"آخر\"}").body());
        HttpResponse<String> linked = reader.put(other, "{\"nameAr\":\"آخر\",\"wikidataId\":\"Q241026\"}", "\"0\"");
        assertThat(linked.statusCode()).isEqualTo(409);
        assertThat(jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner AND wikidata_id = 'Q241026'")
                .param("owner", reader.accountId())
                .query(Long.class)
                .single())
                .isOne();
    }

    @Test
    void anotherReaderMayLinkTheSameScholar() throws Exception {
        assertThat(newAccount().post(AUTHORS, BUKHARI).statusCode()).isEqualTo(201);
        assertThat(newAccount().post(AUTHORS, BUKHARI).statusCode()).isEqualTo(201);
    }

    @Test
    void theLinkIsCheckedLikeAnyInput() throws Exception {
        ApiBrowser reader = newAccount();

        for (String bad : new String[] {"Q0", "Q", "q241026", "Q241026 ", "P31", "Q12345678901234", "<script>"}) {
            HttpResponse<String> response =
                    reader.post(AUTHORS, "{\"nameAr\":\"البخاري\",\"wikidataId\":\"" + bad.replace("\"", "") + "\"}");
            assertThat(response.statusCode()).as(bad).isEqualTo(400);
            assertThat(response.body()).as(bad).contains("\"field\":\"wikidataId\"");
            if (bad.length() > 2) {
                assertThat(response.body()).as(bad).doesNotContain(bad.trim()); // never echoed
            }
        }
    }

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }
}
