package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import io.github.adamstac.libraryapp.reference.SampleIsbnRanges;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Suggestions for a new copy from its ISBN (ADR 0010, layer 1, slice L2), over real HTTP with a real Postgres and the
 * made-up sample ranges ({@link SampleIsbnRanges}). Each test makes its own accounts. Threat model: book-lookup.
 *
 * <p>In the sample, 978-9933-685 and 978-9933-686 are two Syrian publishers, 978-0-306 an English-language one, and
 * 979-10-90636 a French one.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class EditionSuggestionTests {

    static final String SUGGESTIONS = "/api/v1/editions/suggestions?isbn=";

    // Three books from one Syrian publisher, one from another, and one from Lebanon
    static final String SYRIA_685_A = "9789933685010";
    static final String SYRIA_685_B = "9789933685027";
    static final String SYRIA_685_C = "9789933685034";
    static final String SYRIA_686 = "9789933686017";
    static final String LEBANON = "9789953000015";
    static final String ENGLISH_306 = "9780306400018";
    static final String ENGLISH_306_AS_ISBN10 = "0306400022";
    static final String FRANCE_90636 = "9791090636019";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ApplicationContext context;

    @BeforeEach
    void loadTheSampleRanges() {
        SampleIsbnRanges.load(context);
    }

    // ---- From your own books -------------------------------------------------------------------------------------

    @Test
    void yourBooksFromTheSamePublisherSuggestItsNamePlaceAndLanguage() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        addEdition(reader, work, SYRIA_685_A, "دار الغوثاني", "دمشق", "ar");

        String body = suggestions(reader, SYRIA_685_B);

        assertThat(body).contains("\"publisher\":{\"value\":\"دار الغوثاني\",\"from\":\"yourBooks\",\"country\":null}");
        assertThat(body).contains("\"publicationPlace\":{\"value\":\"دمشق\",\"from\":\"yourBooks\",\"country\":null}");
        assertThat(body).contains("\"language\":{\"value\":\"ar\",\"from\":\"yourBooks\",\"country\":null}");
    }

    @Test
    void theNameYouUseMostForAPublisherIsSuggested() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        addEdition(reader, work, SYRIA_685_A, "دار الغوثاني", "دمشق", null);
        addEdition(reader, work, SYRIA_685_B, "دار الغوثاني", "دمشق", null);
        addEdition(reader, work, SYRIA_685_C, "الغوثاني", "بيروت", null); // the newest, but the rarer spelling

        String body = suggestions(reader, "9789933685041");

        assertThat(body).contains("\"publisher\":{\"value\":\"دار الغوثاني\"");
        assertThat(body).contains("\"publicationPlace\":{\"value\":\"دمشق\"");
    }

    @Test
    void anIsbn10AndAnIsbn13FromTheSamePublisherFindEachOther() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        addEdition(reader, work, ENGLISH_306_AS_ISBN10, "Plenum Press", "New York", "en");

        assertThat(suggestions(reader, ENGLISH_306)).contains("\"publisher\":{\"value\":\"Plenum Press\"");
        assertThat(suggestions(reader, "0-306-40001-4")).contains("\"publisher\":{\"value\":\"Plenum Press\"");
    }

    @Test
    void aDifferentPublisherInTheSameCountryIsNotSuggested() throws Exception {
        ApiBrowser reader = newAccount();
        addEdition(reader, workId(reader), SYRIA_686, "دار الفكر", "دمشق", "ar");

        String body = suggestions(reader, SYRIA_685_A);

        assertThat(body).contains("\"publisher\":null", "\"publicationPlace\":null");
        assertThat(body).doesNotContain("دار الفكر");
        // The language still comes from the ISBN's country
        assertThat(body).contains("\"language\":{\"value\":\"ar\",\"from\":\"country\",\"country\":\"SY\"}");
    }

    @Test
    void suggestionsOnlyComeFromYourOwnBooks() throws Exception {
        ApiBrowser owner = newAccount();
        addEdition(owner, workId(owner), SYRIA_685_A, "دار الغوثاني", "دمشق", "ar");
        ApiBrowser someoneElse = newAccount();

        String body = suggestions(someoneElse, SYRIA_685_B);

        assertThat(body).doesNotContain("دار الغوثاني", "دمشق", "yourBooks");
    }

    @Test
    void aBookIsNeverSuggestedToItselfWhenEdited() throws Exception {
        ApiBrowser reader = newAccount();
        String path = addEdition(reader, workId(reader), SYRIA_685_A, "دار الغوثاني", "دمشق", "ar");
        String id = path.substring(path.lastIndexOf('/') + 1);

        String body = suggestions(reader, SYRIA_685_A + "&excludeId=" + id);

        assertThat(body).doesNotContain("دار الغوثاني", "yourBooks");
    }

    @Test
    void aBookInTheBinIsNotUsed() throws Exception {
        ApiBrowser reader = newAccount();
        String path = addEdition(reader, workId(reader), SYRIA_685_A, "دار الغوثاني", "دمشق", "ar");
        assertThat(reader.delete(path).statusCode()).isEqualTo(204);

        assertThat(suggestions(reader, SYRIA_685_B)).doesNotContain("دار الغوثاني");
    }

    // ---- From the ISBN itself ------------------------------------------------------------------------------------

    @Test
    void theLanguageComesFromTheCountryOrLanguageAreaWhenYouHaveNoBooksFromThePublisher() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(suggestions(reader, LEBANON))
                .isEqualTo("{\"publisher\":null,\"publicationPlace\":null,"
                        + "\"language\":{\"value\":\"ar\",\"from\":\"country\",\"country\":\"LB\"}}");
        assertThat(suggestions(reader, ENGLISH_306))
                .contains("\"language\":{\"value\":\"en\",\"from\":\"languageArea\",\"country\":null}");
        assertThat(suggestions(reader, FRANCE_90636))
                .contains("\"language\":{\"value\":\"fr\",\"from\":\"country\",\"country\":\"FR\"}");
        // An older Saudi code, not in the sample ranges: the country is still known
        assertThat(suggestions(reader, "9789960000008"))
                .contains("\"language\":{\"value\":\"ar\",\"from\":\"country\",\"country\":\"SA\"}");
    }

    @Test
    void anArabicPublisherOnAnotherCountrysCodeGivesArabicNotThatCountrysLanguage() throws Exception {
        ApiBrowser reader = newAccount();

        // Dar al-Kutub al-Ilmiyya, Beirut, whose ISBNs are on France's code (Sharh Ibn Battal, 2003)
        assertThat(suggestions(reader, "9782745135100"))
                .contains("\"language\":{\"value\":\"ar\",\"from\":\"publisher\",\"country\":\"LB\"}");
        // Another publisher on France's code is still French
        assertThat(suggestions(reader, "9782070360024"))
                .contains("\"language\":{\"value\":\"fr\",\"from\":\"languageArea\",\"country\":null}");
    }

    @Test
    void withoutTheImportedRangesOnlyTheLanguageIsSuggested() throws Exception {
        ApiBrowser reader = newAccount();
        addEdition(reader, workId(reader), SYRIA_685_A, "دار الغوثاني", "دمشق", "ar");
        SampleIsbnRanges.clear(context);
        try {
            String body = suggestions(reader, SYRIA_685_B);

            assertThat(body).contains("\"publisher\":null", "\"publicationPlace\":null");
            assertThat(body).contains("\"language\":{\"value\":\"ar\",\"from\":\"country\",\"country\":\"SY\"}");
        } finally {
            SampleIsbnRanges.load(context);
        }
    }

    @Test
    void anIsbnFromNowhereOnTheListSuggestsNothing() throws Exception {
        // 978-969 (Pakistan) publishes in several languages, so it's left off the list on purpose
        assertThat(suggestions(newAccount(), "9789690000002"))
                .isEqualTo("{\"publisher\":null,\"publicationPlace\":null,\"language\":null}");
    }

    // ---- Checked like any input ----------------------------------------------------------------------------------

    @Test
    void suggestionsNeedSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(SUGGESTIONS + SYRIA_685_A).statusCode()).isEqualTo(401);
    }

    @Test
    void theIsbnIsCheckedAndNeverEchoed() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> wrong = reader.get(SUGGESTIONS + "9789933685011");
        assertThat(wrong.statusCode()).isEqualTo(400);
        assertThat(wrong.body()).contains("invalid_isbn").doesNotContain("9789933685011");

        HttpResponse<String> hostile = reader.get(SUGGESTIONS + encode("<script>alert(1)</script>"));
        assertThat(hostile.statusCode()).isEqualTo(400);
        assertThat(hostile.body()).doesNotContain("script");

        HttpResponse<String> missing = reader.get("/api/v1/editions/suggestions");
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(missing.body()).contains("required");

        assertThat(reader.get(SUGGESTIONS + SYRIA_685_A + "&excludeId=not-an-id").statusCode()).isEqualTo(400);
    }

    @Test
    void arabicDigitsAndHyphensAreRead() throws Exception {
        ApiBrowser reader = newAccount();
        addEdition(reader, workId(reader), SYRIA_685_A, "دار الغوثاني", null, null);

        assertThat(suggestions(reader, encode("٩٧٨-٩٩٣٣-٦٨٥-٠٢-٧"))).contains("دار الغوثاني");
    }

    @Test
    void hostileTextYouSavedComesBackAsPlainJsonText() throws Exception {
        ApiBrowser reader = newAccount();
        addEdition(reader, workId(reader), SYRIA_685_A, "<img src=x onerror=alert(1)>", null, null);

        HttpResponse<String> answer = reader.get(SUGGESTIONS + SYRIA_685_B);

        assertThat(answer.headers().firstValue("Content-Type")).hasValueSatisfying(type -> assertThat(type)
                .startsWith("application/json"));
        assertThat(answer.body()).contains("\"value\":\"<img src=x onerror=alert(1)>\"");
    }

    // ---- Helpers -------------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private static String suggestions(ApiBrowser reader, String isbnAndMore) throws Exception {
        HttpResponse<String> answer = reader.get(SUGGESTIONS + isbnAndMore);
        assertThat(answer.statusCode()).as(answer.body()).isEqualTo(200);
        return answer.body();
    }

    private static String workId(ApiBrowser browser) throws Exception {
        HttpResponse<String> created = browser.post(EditionTests.WORKS, "{\"titleEn\":\"A work\"}");
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String location = created.headers().firstValue("Location").orElseThrow();
        return location.substring(location.lastIndexOf('/') + 1);
    }

    /** Adds a copy and returns its address. Null fields are left out. */
    private static String addEdition(
            ApiBrowser browser, String workId, String isbn, String publisher, String place, String language)
            throws Exception {
        StringBuilder json = new StringBuilder("{\"workId\":\"" + workId + "\",\"isbn\":\"" + isbn + "\"");
        if (publisher != null) {
            json.append(",\"publisher\":\"").append(publisher.replace("\"", "\\\"")).append('"');
        }
        if (place != null) {
            json.append(",\"publicationPlace\":\"").append(place).append('"');
        }
        if (language != null) {
            json.append(",\"language\":\"").append(language).append('"');
        }
        HttpResponse<String> created = browser.post(EditionTests.EDITIONS, json.append('}').toString());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        return created.headers().firstValue("Location").orElseThrow();
    }

    private static String encode(String text) {
        return URLEncoder.encode(text, StandardCharsets.UTF_8);
    }
}
