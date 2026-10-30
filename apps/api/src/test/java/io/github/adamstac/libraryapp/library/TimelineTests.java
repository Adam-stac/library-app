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

/**
 * The authors timeline: each author with the year they died, the books owned and the science of their works. Over
 * real HTTP with a real Postgres; each test makes its own accounts. Threat model: library.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class TimelineTests {

    static final String TIMELINE = "/api/v1/timeline";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void theTimelineNeedsSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(TIMELINE).statusCode()).isEqualTo(401);
    }

    @Test
    void eachAuthorComesWithTheirDeathYearBooksTitlesAndScience() throws Exception {
        ApiBrowser reader = newAccount();
        String hadith = idFrom(created(reader.post("/api/v1/sciences", "{\"nameEn\":\"Hadith (timeline)\"}")));
        String fiqh = idFrom(created(reader.post("/api/v1/sciences", "{\"nameEn\":\"Fiqh (timeline)\"}")));
        String nawawi = addAuthor(reader, "{\"nameAr\":\"النووي\",\"nameEn\":\"al-Nawawi\",\"death\":{\"hijri\":676}}");
        String riyad = addWork(reader, "Riyad al-Salihin", hadith, nawawi);
        String majmu = addWork(reader, "al-Majmu", fiqh, nawawi);
        addWork(reader, "al-Arbaun", hadith, nawawi);
        addCopy(reader, riyad);
        addCopy(reader, riyad);
        addCopy(reader, majmu);

        HttpResponse<String> response = reader.get(TIMELINE);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"id\":\"" + nawawi + "\"", "\"nameAr\":\"النووي\"", "\"deathHijri\":676", "\"deathCe\":null")
                .contains("\"books\":3", "\"works\":3")
                // Titles in catalogue order ("al-" is ignored), three at most
                .contains("{\"titleAr\":null,\"titleEn\":\"al-Arbaun\"}", "\"titleEn\":\"al-Majmu\"", "\"titleEn\":\"Riyad al-Salihin\"")
                // Two of the three works are hadith
                .contains("\"science\":{\"id\":\"" + hadith + "\"");
    }

    @Test
    void anAuthorWithoutWorksStillAppearsAndOnlyTheCalendarGivenIsSent() throws Exception {
        ApiBrowser reader = newAccount();
        String modern = addAuthor(reader, "{\"nameEn\":\"A modern author\",\"death\":{\"ce\":1999,\"approximate\":true}}");

        assertThat(reader.get(TIMELINE).body())
                .contains("\"id\":\"" + modern + "\"", "\"deathHijri\":null", "\"deathCe\":1999", "\"approximate\":true")
                .contains("\"books\":0", "\"works\":0", "\"titles\":[]", "\"science\":null");
    }

    @Test
    void authorsWithoutADateOfDeathAreListedApart() throws Exception {
        ApiBrowser reader = newAccount();
        String undated = addAuthor(reader, "{\"nameAr\":\"مؤلف معاصر\"}");
        addAuthor(reader, "{\"nameEn\":\"Dated\",\"death\":{\"hijri\":1420}}");

        String body = reader.get(TIMELINE).body();

        assertThat(body.substring(body.indexOf("\"undated\""))).contains("\"id\":\"" + undated + "\"", "مؤلف معاصر");
        assertThat(body.substring(0, body.indexOf("\"undated\""))).doesNotContain(undated).contains("\"deathHijri\":1420");
    }

    @Test
    void onlyYourOwnAuthorsAndBooksAreCounted() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser other = newAccount();
        addAuthor(owner, "{\"nameEn\":\"Owner's author\",\"death\":{\"hijri\":256}}");

        assertThat(other.get(TIMELINE).body()).isEqualTo("{\"authors\":[],\"undated\":[]}");
        assertThat(owner.get(TIMELINE).body()).contains("Owner's author");
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private static String addAuthor(ApiBrowser browser, String json) throws Exception {
        return idFrom(created(browser.post("/api/v1/authors", json)));
    }

    private static String addWork(ApiBrowser browser, String titleEn, String scienceId, String authorId) throws Exception {
        return idFrom(created(browser.post("/api/v1/works", """
                {"titleEn":"%s","scienceId":"%s","authorIds":["%s"]}""".formatted(titleEn, scienceId, authorId))));
    }

    private static void addCopy(ApiBrowser browser, String workId) throws Exception {
        created(browser.post("/api/v1/editions", "{\"workId\":\"" + workId + "\"}"));
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }
}
