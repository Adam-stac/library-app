package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The home page's summary, over real HTTP with a real Postgres. Each test makes its own accounts. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class HomeTests {

    static final String HOME = "/api/v1/home";
    static final String WORKS = "/api/v1/works";
    static final String EDITIONS = "/api/v1/editions";
    static final JsonMapper JSON = JsonMapper.builder().build();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void theSummaryNeedsSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(HOME).statusCode()).isEqualTo(401);
    }

    @Test
    void anEmptyLibraryHasAnEmptySummary() throws Exception {
        HttpResponse<String> response = newAccount().get(HOME);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"books\":0", "\"works\":0", "\"authors\":0", "\"benefits\":0", "\"reading\":0")
                .contains("\"bySciences\":[]", "\"notStarted\":[]", "\"quiet\":[]", "\"spent\":[]")
                .contains("\"recentBookmarks\":[]", "\"recentBenefits\":[]", "\"year\":" + today().getYear());
    }

    @Test
    void theLibraryIsDividedBetweenTheSciencesByCopiesOwned() throws Exception {
        ApiBrowser reader = newAccount();
        String fiqh = workIn(reader, "Fiqh", "al-Mughni");
        String hadith = workIn(reader, "Ḥadīth", "Sahih al-Bukhari");
        String none = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"A book with no science\"}")));
        addEdition(reader, fiqh, ",\"volumes\":15"); // a set of 15 volumes counts once
        addEdition(reader, fiqh, ",\"volumes\":1"); // a second copy of the same work counts again
        addEdition(reader, hadith, "");
        addEdition(reader, none, "");

        JsonNode summary = JSON.readTree(reader.get(HOME).body());

        assertThat(summary.get("counts").get("books").toString()).isEqualTo("4");
        assertThat(summary.get("counts").get("works").toString()).isEqualTo("3");
        // Ranked from most to fewest, with the books that have no science last; the percentages add up to 100
        JsonNode shares = summary.get("bySciences");
        assertThat(shares.size()).isEqualTo(3);
        assertThat(shares.get(0).get("science").get("nameEn").toString()).isEqualTo("\"Fiqh\"");
        assertThat(shares.get(0).get("books").toString()).isEqualTo("2");
        assertThat(shares.get(0).get("percent").toString()).isEqualTo("50");
        assertThat(shares.get(1).get("science").get("nameEn").toString()).isEqualTo("\"Ḥadīth\"");
        assertThat(shares.get(1).get("percent").toString()).isEqualTo("25");
        assertThat(shares.get(2).get("science").isNull()).isTrue();
        assertThat(shares.get(2).get("percent").toString()).isEqualTo("25");
    }

    @Test
    void readingFinishingAndSpendingThisYearAreCounted() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"A work\"}")));
        LocalDate today = today();
        String lastYear = LocalDate.of(today.getYear() - 1, 6, 1).toString();
        // Reading now, started today
        addEdition(reader, work, ",\"startedOn\":\"%s\",\"purchasedOn\":\"%s\",\"price\":{\"amount\":\"95.50\",\"currency\":\"GBP\"}"
                .formatted(today, today));
        // Finished today, started last year, bought last year
        addEdition(reader, work, ",\"startedOn\":\"%s\",\"finishedOn\":\"%s\",\"purchasedOn\":\"%s\",\"price\":{\"amount\":\"10\",\"currency\":\"GBP\"}"
                .formatted(lastYear, today, lastYear));
        // Not started; bought this year in another currency
        addEdition(reader, work, ",\"purchasedOn\":\"%s\",\"price\":{\"amount\":\"45\",\"currency\":\"SAR\"}".formatted(today));

        JsonNode summary = JSON.readTree(reader.get(HOME).body());

        assertThat(summary.get("counts").get("reading").toString()).isEqualTo("1");
        assertThat(summary.get("thisYear").get("started").toString()).isEqualTo("1");
        assertThat(summary.get("thisYear").get("finished").toString()).isEqualTo("1");
        // Per currency, never converted, the largest first; last year's purchase isn't counted
        JsonNode spent = summary.get("thisYear").get("spent");
        assertThat(spent.size()).isEqualTo(2);
        assertThat(spent.get(0).get("currency").toString()).isEqualTo("\"GBP\"");
        assertThat(spent.get(0).get("amount").toString()).isEqualTo("\"95.50\"");
        assertThat(spent.get(1).get("currency").toString()).isEqualTo("\"SAR\"");
        assertThat(spent.get(1).get("amount").toString()).isEqualTo("\"45.00\"");
    }

    @Test
    void booksBoughtButNotStartedAndQuietOnesAreListed() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"A work\"}")));
        LocalDate today = today();
        addEdition(reader, work, ",\"title\":\"Bought recently\",\"purchasedOn\":\"%s\"".formatted(today.minusDays(10)));
        addEdition(reader, work, ",\"title\":\"Bought long ago\",\"purchasedOn\":\"%s\"".formatted(today.minusYears(3)));
        addEdition(reader, work, ",\"title\":\"Never dated\"");
        String quiet = addEdition(reader, work,
                ",\"title\":\"Started and left\",\"startedOn\":\"%s\"".formatted(today.minusDays(200)));
        String moving = addEdition(reader, work,
                ",\"title\":\"Started and moving\",\"startedOn\":\"%s\"".formatted(today.minusDays(200)));
        assertThat(reader.put(moving + "/bookmark", "{\"page\":40}", null).statusCode()).isEqualTo(200);
        addEdition(reader, work, ",\"title\":\"Started this week\",\"startedOn\":\"%s\"".formatted(today.minusDays(2)));

        JsonNode summary = JSON.readTree(reader.get(HOME).body());

        // The oldest purchases first, undated ones last
        assertThat(titles(summary.get("notStarted"))).containsExactly(
                "\"Bought long ago\"", "\"Bought recently\"", "\"Never dated\"");
        // Reading, but nothing has moved for 90 days: the bookmark counts as movement
        assertThat(titles(summary.get("quiet"))).containsExactly("\"Started and left\"");
        assertThat(summary.get("quiet").get(0).get("id").toString()).isEqualTo("\"" + idFrom(quiet) + "\"");
        assertThat(summary.get("recentBookmarks").size()).isEqualTo(1);
    }

    @Test
    void theSummaryOnlyCountsYourOwnLibrary() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String work = idFrom(created(other.post(WORKS, "{\"titleEn\":\"Not yours\"}")));
        addEdition(other, work, ",\"startedOn\":\"" + today() + "\"");
        created(other.post("/api/v1/benefits", "{\"text\":\"Not your benefit\"}"));
        created(other.post("/api/v1/authors", "{\"nameEn\":\"Not your author\"}"));

        String summary = reader.get(HOME).body();

        assertThat(summary).contains("\"books\":0", "\"authors\":0", "\"benefits\":0", "\"reading\":0", "\"started\":0")
                .doesNotContain("Not you");
        assertThat(other.get(HOME).body()).contains("\"books\":1", "\"authors\":1", "\"benefits\":1", "Not your benefit");
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    /** The JSON titles of a list of books, in order. */
    private static List<String> titles(JsonNode books) {
        List<String> titles = new ArrayList<>();
        for (int i = 0; i < books.size(); i++) {
            titles.add(books.get(i).get("title").toString());
        }
        return titles;
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneOffset.UTC);
    }

    /** Adds a work in one of the account's starter sciences and returns its ID. */
    private String workIn(ApiBrowser browser, String science, String title) throws Exception {
        String scienceId = jdbc.sql("SELECT id::text FROM sciences WHERE owner_id = :owner AND name_en = :name")
                .param("owner", browser.accountId())
                .param("name", science)
                .query(String.class)
                .single();
        return idFrom(created(browser.post(WORKS, "{\"titleEn\":\"%s\",\"scienceId\":\"%s\"}".formatted(title, scienceId))));
    }

    /** Adds an edition of the work and returns its address; {@code more} is extra JSON fields, starting with a comma. */
    private static String addEdition(ApiBrowser browser, String workId, String more) throws Exception {
        return created(browser.post(EDITIONS, "{\"workId\":\"" + workId + "\"" + more + "}"));
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }
}
