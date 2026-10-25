package io.github.adamstac.libraryapp.authors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.CrossUserAccess;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Authors, over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class AuthorTests {

    static final String AUTHORS = "/api/v1/authors";
    static final Pattern ID = Pattern.compile("\"id\":\"([0-9a-f-]{36})\"");

    static final String BUKHARI = """
            {"nameAr":"البخاري","nameEn":"al-Bukhari","fullName":"محمد بن إسماعيل البخاري",
             "kunya":"أبو عبد الله","nisba":"البخاري",
             "birth":{"hijri":194,"ce":810,"approximate":false},
             "death":{"hijri":256},
             "biography":"صاحب الصحيح.\\nوُلد في بخارى."}""";

    static final String EDIT = """
            {"nameAr":"الإمام البخاري","nameEn":"Imam al-Bukhari",
             "birth":{"hijri":194,"approximate":true},"death":{"hijri":256}}""";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void libraryNeedsSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = AUTHORS + "/" + UUID.randomUUID();

        assertThat(nobody.get(AUTHORS).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(AUTHORS, BUKHARI).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void libraryChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String path = AUTHORS + "/" + add(reader, BUKHARI);

        assertThat(reader.send("POST", AUTHORS, BUKHARI, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, EDIT, "\"0\"", false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);

        HttpResponse<String> after = reader.get(path);
        assertThat(after.statusCode()).isEqualTo(200);
        assertThat(after.body()).contains("\"version\":0");
        assertThat(countFor(reader)).isEqualTo(1);
    }

    @Test
    void anotherUsersAuthorsAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String id = add(owner, BUKHARI);

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist
        CrossUserAccess.assertInvisible(intruder, AUTHORS + "/" + id, EDIT);

        assertThat(intruder.get(AUTHORS).body()).contains("\"total\":0").doesNotContain(id);
        HttpResponse<String> after = owner.get(AUTHORS + "/" + id);
        assertThat(after.statusCode()).isEqualTo(200);
        assertThat(after.body()).contains("\"nameAr\":\"البخاري\"", "\"version\":0");
    }

    @Test
    void ownerIdAndVersionInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();
        UUID chosenId = UUID.randomUUID();

        HttpResponse<String> response = attacker.post(AUTHORS, """
                {"id":"%s","ownerId":"%s","owner_id":"%s","version":99,"nameEn":"Planted"}"""
                .formatted(chosenId, victim.accountId(), victim.accountId()));

        // Unknown fields are either ignored or refused; either way they are never used
        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(idOf(response.body())).isNotEqualTo(chosenId.toString());
            assertThat(response.body()).contains("\"version\":0");
            assertThat(countFor(attacker)).isEqualTo(1);
        }
        assertThat(countFor(victim)).isZero();
    }

    // ---- Adding, reading, editing and deleting -----------------------------------------------------------------

    @Test
    void anAuthorCanBeAddedViewedEditedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> created = reader.post(AUTHORS, BUKHARI);

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String id = idOf(created.body());
        String path = AUTHORS + "/" + id;
        assertThat(created.headers().firstValue("Location")).hasValue(path);
        assertThat(created.headers().firstValue("ETag")).hasValue("\"0\"");

        HttpResponse<String> read = reader.get(path);
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(read.headers().firstValue("ETag")).hasValue("\"0\"");
        assertThat(read.body())
                .contains("\"nameAr\":\"البخاري\"", "\"nameEn\":\"al-Bukhari\"", "\"kunya\":\"أبو عبد الله\"")
                .contains("\"biography\":\"صاحب الصحيح.\\nوُلد في بخارى.\"", "\"version\":0")
                .containsPattern("\"birth\":\\{[^}]*\"hijri\":194")
                .containsPattern("\"birth\":\\{[^}]*\"ce\":810")
                .containsPattern("\"death\":\\{[^}]*\"hijri\":256")
                .containsPattern("\"death\":\\{[^}]*\"ce\":null");

        HttpResponse<String> edited = reader.put(path, EDIT, "\"0\"");

        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(edited.body())
                .contains("\"nameAr\":\"الإمام البخاري\"", "\"version\":1")
                .containsPattern("\"birth\":\\{[^}]*\"approximate\":true")
                .as("fields left out of an edit are cleared")
                .doesNotContain("محمد بن إسماعيل", "صاحب الصحيح");

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
    }

    @Test
    void textIsTrimmedAndNormalisedBeforeItIsStored() throws Exception {
        ApiBrowser reader = newAccount();

        // Alif + combining hamza (two characters) is stored as the single letter أ; a blank English name is "none"
        HttpResponse<String> created = reader.post(AUTHORS, """
                {"nameAr":"  \\u0627\\u0654حمد بن حنبل  ","nameEn":"   "}""");

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String stored = jdbc.sql("SELECT name_ar FROM authors WHERE id = :id")
                .param("id", UUID.fromString(idOf(created.body())))
                .query(String.class)
                .single();
        assertThat(stored).isEqualTo("أحمد بن حنبل");
        assertThat(jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner AND name_en IS NULL")
                        .param("owner", reader.accountId())
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
    }

    @Test
    void atLeastOneNameIsNeeded() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> response = reader.post(AUTHORS, """
                {"nameAr":"  ","nameEn":"","death":{"hijri":256}}""");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"nameAr\"", "\"code\":\"name_required\"");
        assertThat(reader.post(AUTHORS, "{\"nameEn\":\"Ibn Kathir\"}").statusCode()).isEqualTo(201);
    }

    // ---- Rules for what's typed --------------------------------------------------------------------------------

    @Test
    void fieldLimitsAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(AUTHORS, name("a".repeat(201))), "nameEn", "too_long");
        assertThat(reader.post(AUTHORS, "{\"nameAr\":\"" + "ب".repeat(200) + "\"}").statusCode()).isEqualTo(201);
        assertFieldError(
                reader.post(AUTHORS, "{\"nameEn\":\"x\",\"biography\":\"" + "a".repeat(10_001) + "\"}"),
                "biography",
                "too_long");
        assertThat(reader.post(AUTHORS, "{\"nameEn\":\"x\",\"biography\":\"" + "ب".repeat(10_000) + "\"}").statusCode())
                .isEqualTo(201);
        assertFieldError(reader.post(AUTHORS, name("First\\nSecond")), "nameEn", "invalid_characters");

        // The database refuses it too, if the API ever let it through
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO authors (id, owner_id, name_en) VALUES (:id, :owner, repeat('a', 201))")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO authors (id, owner_id) VALUES (:id, :owner)")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .as("an author with no name")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void directionControlCharactersAreRefused() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(AUTHORS, name("al-Bukh\\u202Eiraa")), "nameEn", "invalid_characters");
        assertFieldError(reader.post(AUTHORS, name("isolate\\u2066d")), "nameEn", "invalid_characters");
        // Characters Postgres can't store are refused cleanly, not with a crash
        assertFieldError(reader.post(AUTHORS, name("nul\\u0000")), "nameEn", "invalid_characters");
        assertThat(reader.post(AUTHORS, name("half\\ud800")).statusCode()).isEqualTo(400);
        assertThat(countFor(reader)).isZero();
    }

    @Test
    void yearsAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(AUTHORS, withYears("{\"hijri\":0}", "null")), "birth.hijri", "invalid_year");
        assertFieldError(reader.post(AUTHORS, withYears("null", "{\"hijri\":1501}")), "death.hijri", "invalid_year");
        assertFieldError(reader.post(AUTHORS, withYears("{\"ce\":-1501}", "null")), "birth.ce", "invalid_year");
        assertFieldError(reader.post(AUTHORS, withYears("null", "{\"ce\":2101}")), "death.ce", "invalid_year");
        assertFieldError(
                reader.post(AUTHORS, withYears("{\"hijri\":256}", "{\"hijri\":194}")), "death.hijri", "before_birth");
        assertFieldError(reader.post(AUTHORS, withYears("{\"ce\":870}", "{\"ce\":810}")), "death.ce", "before_birth");
        assertThat(reader.post(AUTHORS, withYears("{\"hijri\":\"two hundred\"}", "null")).statusCode())
                .isEqualTo(400);

        // Abu Bakr: born about 51 years before the Hijra, died 13 AH
        HttpResponse<String> beforeTheHijra =
                reader.post(AUTHORS, withYears("{\"hijri\":-51,\"approximate\":true}", "{\"hijri\":13,\"ce\":634}"));
        assertThat(beforeTheHijra.statusCode()).as(beforeTheHijra.body()).isEqualTo(201);
        assertThat(beforeTheHijra.body())
                .containsPattern("\"birth\":\\{[^}]*\"hijri\":-51")
                .containsPattern("\"birth\":\\{[^}]*\"approximate\":true");

        // "About" with no year means nothing, so it isn't kept
        HttpResponse<String> noYear = reader.post(AUTHORS, withYears("{\"approximate\":true}", "null"));
        assertThat(noYear.statusCode()).isEqualTo(201);
        assertThat(noYear.body()).containsPattern("\"birth\":\\{[^}]*\"approximate\":false");
    }

    // ---- Edits from two devices --------------------------------------------------------------------------------

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String path = AUTHORS + "/" + add(laptop, BUKHARI);

        assertThat(laptop.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, name("Edited on the phone"), "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("الإمام البخاري").doesNotContain("Edited on the phone");

        // The version must be sent, as a strong ETag
        for (String missingOrMalformed : new String[] {null, "1", "W/\"1\"", "\"one\"", "*"}) {
            HttpResponse<String> response = phone.put(path, name("Edited on the phone"), missingOrMalformed);
            assertThat(response.statusCode()).as("If-Match: " + missingOrMalformed).isEqualTo(400);
            assertThat(response.body()).contains("\"code\":\"version_required\"");
        }

        HttpResponse<String> fresh = phone.put(path, name("Edited on the phone"), "\"1\"");
        assertThat(fresh.statusCode()).isEqualTo(200);
        assertThat(fresh.body()).contains("\"version\":2");
    }

    // ---- Lists -------------------------------------------------------------------------------------------------

    @Test
    void listsOnlyShowYourOwnRecordsInNameOrder() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        add(reader, "{\"nameAr\":\"الطبري\",\"nameEn\":\"al-Tabari\",\"death\":{\"hijri\":310}}");
        add(reader, "{\"nameAr\":\"ابن كثير\",\"nameEn\":\"Ibn Kathir\"}");
        add(reader, "{\"nameEn\":\"Abu Hanifa\"}");
        add(other, "{\"nameEn\":\"Not yours\"}");

        String english = reader.get(AUTHORS + "?sort=en").body();
        assertThat(english).contains("\"total\":3").doesNotContain("Not yours");
        assertThat(english.indexOf("Abu Hanifa")).isLessThan(english.indexOf("al-Tabari"));
        assertThat(english.indexOf("al-Tabari")).isLessThan(english.indexOf("Ibn Kathir"));
        assertThat(english).containsPattern("\"death\":\\{[^}]*\"hijri\":310").doesNotContain("biography");

        String arabic = reader.get(AUTHORS + "?sort=ar").body();
        assertThat(arabic.indexOf("ابن كثير")).isLessThan(arabic.indexOf("الطبري"));

        String secondPage = reader.get(AUTHORS + "?sort=en&size=1&page=1").body();
        assertThat(secondPage).contains("al-Tabari", "\"page\":1", "\"size\":1", "\"total\":3")
                .doesNotContain("Abu Hanifa", "Ibn Kathir");
    }

    @Test
    void pageSizeIsCapped() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.get(AUTHORS + "?size=500").body()).contains("\"size\":100");
        assertThat(reader.get(AUTHORS + "?size=0").body()).contains("\"size\":1");
        assertFieldError(reader.get(AUTHORS + "?page=-1"), "page", "invalid");
        assertFieldError(reader.get(AUTHORS + "?sort=fr"), "sort", "invalid");
        assertFieldError(reader.get(AUTHORS + "?size=lots"), "size", "invalid");
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        jdbc.sql("""
                        INSERT INTO authors (id, owner_id, name_en)
                        SELECT gen_random_uuid(), :owner, 'Author ' || n FROM generate_series(1, :count) AS n
                        """)
                .param("owner", reader.accountId())
                .param("count", AuthorService.MAX_AUTHORS_PER_ACCOUNT - 1)
                .update();

        assertThat(reader.post(AUTHORS, BUKHARI).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(AUTHORS, BUKHARI);

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(countFor(reader)).isEqualTo(AuthorService.MAX_AUTHORS_PER_ACCOUNT);
        assertThat(newAccount().post(AUTHORS, BUKHARI).statusCode()).as("other accounts aren't affected").isEqualTo(201);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimit() throws Exception {
        ApiBrowser reader = newAccount();
        jdbc.sql("""
                        INSERT INTO authors (id, owner_id, name_en)
                        SELECT gen_random_uuid(), :owner, 'Author ' || n FROM generate_series(1, :count) AS n
                        """)
                .param("owner", reader.accountId())
                .param("count", AuthorService.MAX_AUTHORS_PER_ACCOUNT - 2)
                .update();
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (ApiBrowser device : devices) {
                answers.add(pool.submit(() -> device.post(AUTHORS, BUKHARI)));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(4);
        assertThat(countFor(reader)).isEqualTo(AuthorService.MAX_AUTHORS_PER_ACCOUNT);
    }

    @Test
    void oversizedBodiesAreRefused() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> response =
                reader.post(AUTHORS, "{\"nameEn\":\"x\",\"biography\":\"" + "a".repeat(70_000) + "\"}");

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("\"code\":\"request_too_large\"");
        assertThat(countFor(reader)).isZero();
    }

    @Test
    void tooManyChangesAreSlowedDown() throws Exception {
        ApiBrowser reader = newAccount();
        for (int i = 0; i < 120; i++) {
            assertThat(reader.delete(AUTHORS + "/" + UUID.randomUUID()).statusCode()).isEqualTo(404);
        }

        HttpResponse<String> limited = reader.delete(AUTHORS + "/" + UUID.randomUUID());

        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(limited.body()).contains("\"code\":\"rate_limited\"");
        assertThat(limited.headers().firstValue("Retry-After")).isPresent();
        assertThat(reader.get(AUTHORS).statusCode()).as("reading still works").isEqualTo(200);
        assertThat(newAccount().post(AUTHORS, BUKHARI).statusCode()).as("other accounts aren't affected").isEqualTo(201);
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateNote";

        List<HttpResponse<String>> responses = List.of(
                reader.post(AUTHORS, name(marker + "\\u202E")),
                reader.post(AUTHORS, name(marker.repeat(30))),
                reader.post(AUTHORS, "{\"nameEn\":\"x\",\"birth\":{\"hijri\":\"" + marker + "\"}}"),
                reader.post(AUTHORS, "{\"nameEn\":" + "[\"" + marker + "\"]}"),
                reader.get(AUTHORS + "?size=" + marker),
                reader.get(AUTHORS + "?sort=" + marker));

        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    @Test
    void deletingTheAccountRemovesTheLibrary() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, BUKHARI);
        add(reader, EDIT);

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(countFor(reader)).isZero();
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private static String add(ApiBrowser browser, String json) throws Exception {
        HttpResponse<String> response = browser.post(AUTHORS, json);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return idOf(response.body());
    }

    static String idOf(String body) {
        Matcher id = ID.matcher(body);
        assertThat(id.find()).as(body).isTrue();
        return id.group(1);
    }

    private long countFor(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM authors WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    /** A body with just an English name; {@code value} is already JSON-escaped. */
    private static String name(String value) {
        return "{\"nameEn\":\"" + value + "\"}";
    }

    private static String withYears(String birth, String death) {
        return "{\"nameEn\":\"Someone\",\"birth\":" + birth + ",\"death\":" + death + "}";
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
