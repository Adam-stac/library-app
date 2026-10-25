package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Search across the library and catalogue order (V16), over real HTTP with a real Postgres. Each test makes its own
 * accounts. Threat model: library.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class SearchTests {

    static final String SEARCH = "/api/v1/search?q=";
    static final String AUTHORS = "/api/v1/authors";
    static final String WORKS = "/api/v1/works";
    static final String EDITIONS = "/api/v1/editions";
    static final String BENEFITS = "/api/v1/benefits";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void searchNeedsSignIn() throws Exception {
        assertThat(ApiBrowser.signedOut(port).get(SEARCH + "x").statusCode()).isEqualTo(401);
    }

    @Test
    void searchMatchesTheArabicAwareWay() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, AUTHORS, "{\"nameAr\":\"أحمد بن حنبل\",\"nameEn\":\"Aḥmad ibn Ḥanbal\"}");
        String work = idFrom(add(reader, WORKS, "{\"titleAr\":\"المُغْنِي\",\"titleEn\":\"al-Mughnī\"}"));
        add(reader, WORKS, "{\"titleAr\":\"فتـــح الباري\"}");
        add(reader, WORKS, "{\"titleAr\":\"الرسالة\"}");
        add(reader, EDITIONS, "{\"workId\":\"" + work + "\",\"muhaqqiq\":\"عبد الله التركي\",\"isbn\":\"978-0-306-40615-7\"}");
        add(reader, BENEFITS, "{\"text\":\"إنَّما الأعمالُ بالنِّيّات\"}");

        // Hamza forms, vowel marks, the tatweel, ة and ه, transliteration marks and Arabic-Indic digits
        assertThat(search(reader, "احمد")).contains("أحمد بن حنبل");
        assertThat(search(reader, "ibn hanbal")).contains("أحمد بن حنبل");
        assertThat(search(reader, "مغني")).contains("المُغْنِي");
        assertThat(search(reader, "mughni")).contains("al-Mughnī");
        assertThat(search(reader, "فتح")).contains("فتـــح الباري");
        assertThat(search(reader, "الرساله")).contains("الرسالة");
        assertThat(search(reader, "الاعمال بالنيات")).contains("إنَّما الأعمالُ بالنِّيّات");
        assertThat(search(reader, "التركي")).containsPattern("\"editions\":\\{\"items\":\\[\\{");
        assertThat(search(reader, "٩٧٨٠٣٠٦")).containsPattern("\"editions\":\\{\"items\":\\[\\{");

        // The shared list of places is searched too, by its other names
        assertThat(search(reader, "اسطنبول")).contains("Constantinople");
        assertThat(search(reader, "nothing like this")).contains("\"total\":0").doesNotContain("\"total\":1");
    }

    @Test
    void searchOnlyFindsYourOwnRecords() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        add(other, AUTHORS, "{\"nameEn\":\"Someone else's al-Nawawi\"}");
        String work = idFrom(add(other, WORKS, "{\"titleEn\":\"Someone else's Riyad al-Salihin\"}"));
        add(other, EDITIONS, "{\"workId\":\"" + work + "\",\"title\":\"Someone else's copy\"}");
        add(other, BENEFITS, "{\"text\":\"Someone else's benefit\"}");
        add(other, "/api/v1/places", "{\"nameEn\":\"Someone else's village\"}");

        String found = search(reader, "someone else");

        assertThat(found).doesNotContain("Someone else").doesNotContain("\"total\":1");
        assertThat(search(other, "someone else")).contains("Someone else's al-Nawawi", "Someone else's village");
    }

    @Test
    void wildcardsInSearchAreLiteral() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, BENEFITS, "{\"text\":\"Save 50% of your time\"}");
        add(reader, BENEFITS, "{\"text\":\"Save 50 minutes of your time\"}");
        add(reader, BENEFITS, "{\"text\":\"file_name\"}");
        add(reader, BENEFITS, "{\"text\":\"filename\"}");

        assertThat(search(reader, "50%25")).contains("Save 50% of your time").doesNotContain("50 minutes");
        assertThat(search(reader, "file_name")).contains("file_name").doesNotContain("\"excerpt\":\"filename\"");
        assertThat(search(reader, "%25%25%25")).as("no letter or digit").contains("\"code\":\"required\"");
    }

    @Test
    void theSearchTextIsChecked() throws Exception {
        ApiBrowser reader = newAccount();
        for (int i = 1; i <= 3; i++) {
            add(reader, AUTHORS, "{\"nameEn\":\"Shaykh " + i + "\"}");
        }

        assertFieldError(reader.get("/api/v1/search"), "q", "required");
        assertFieldError(reader.get(SEARCH + "%20%20"), "q", "required");
        assertFieldError(reader.get(SEARCH + "%D9%80%D9%8E"), "q", "required"); // a tatweel and a fatha: no letter
        assertFieldError(reader.get(SEARCH + "a".repeat(101)), "q", "too_long");
        assertFieldError(reader.get(SEARCH + "ab%E2%80%AEcd"), "q", "invalid_characters");

        String two = reader.get(SEARCH + "shaykh&limit=2").body();
        assertThat(two).contains("Shaykh 1", "Shaykh 2", "\"total\":3").doesNotContain("Shaykh 3");
        assertThat(reader.get(SEARCH + "shaykh&limit=0").body()).contains("Shaykh 1").doesNotContain("Shaykh 2");
        assertFieldError(reader.get(SEARCH + "shaykh&limit=many"), "limit", "invalid");
    }

    @Test
    void longBenefitsShowAnExcerpt() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, BENEFITS, "{\"text\":\"" + "ب".repeat(299) + "Xend of the excerpt" + "\"}");

        String found = search(reader, "excerpt");

        assertThat(found).contains("\"shortened\":true", "ب".repeat(299) + "X\"").doesNotContain("end of the excerpt");
    }

    @Test
    void listsFollowCatalogueOrder() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, AUTHORS, "{\"nameAr\":\"أحمد بن حنبل\"}");
        add(reader, AUTHORS, "{\"nameAr\":\"إبراهيم النخعي\"}");
        add(reader, AUTHORS, "{\"nameAr\":\"الطبري\"}");
        add(reader, AUTHORS, "{\"nameAr\":\"ابن كثير\"}");

        // أ إ ا count as one letter, and a leading "ال" is ignored: ابراهيم، ابن، احمد، طبري
        String list = reader.get(AUTHORS + "?sort=ar").body();
        assertThat(list.indexOf("إبراهيم النخعي")).isLessThan(list.indexOf("ابن كثير"));
        assertThat(list.indexOf("ابن كثير")).isLessThan(list.indexOf("أحمد بن حنبل"));
        assertThat(list.indexOf("أحمد بن حنبل")).isLessThan(list.indexOf("الطبري"));
        // What was typed is stored as typed
        assertThat(list).contains("\"nameAr\":\"إبراهيم النخعي\"", "\"nameAr\":\"الطبري\"");
    }

    @Test
    void errorsNeverEchoTheSearchText() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateQuery";

        List<HttpResponse<String>> responses = List.of(
                reader.get(SEARCH + marker.repeat(10)),
                reader.get(SEARCH + marker + "%E2%80%AE"),
                reader.get(SEARCH + "x&limit=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    /** Searches with text that needs no escaping in a URL beyond spaces (and percent-encoded text). */
    private static String search(ApiBrowser browser, String text) throws Exception {
        String query = text.chars().allMatch(c -> c < 128) ? text.replace(" ", "%20")
                : java.net.URLEncoder.encode(text, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
        HttpResponse<String> response = browser.get(SEARCH + query);
        assertThat(response.statusCode()).as(response.body()).isIn(200, 400);
        return response.body();
    }

    private static String add(ApiBrowser browser, String path, String json) throws Exception {
        HttpResponse<String> response = browser.post(path, json);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
