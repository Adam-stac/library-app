package io.github.adamstac.libraryapp.library;

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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Works, over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. A work's
 * body also holds its science's and authors' IDs, so a new work's ID is read from the Location header.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class WorkTests {

    static final String WORKS = "/api/v1/works";
    static final String AUTHORS = "/api/v1/authors";
    static final String SCIENCES = "/api/v1/sciences";
    static final String PLACES = "/api/v1/places";

    static final String SAHIH = "{\"titleAr\":\"صحيح البخاري\",\"titleEn\":\"Sahih al-Bukhari\"}";
    static final String EDIT = "{\"titleAr\":\"الجامع الصحيح\",\"titleEn\":\"al-Jami al-Sahih\"}";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void worksNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = WORKS + "/" + UUID.randomUUID();

        assertThat(nobody.get(WORKS).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(WORKS, SAHIH).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void workChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String path = addWork(reader, SAHIH);

        assertThat(reader.send("POST", WORKS, SAHIH, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, EDIT, "\"0\"", false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(path).body()).contains("\"version\":0", "صحيح البخاري");
        assertThat(worksOf(reader)).isEqualTo(1);
    }

    @Test
    void anotherUsersWorksAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String path = addWork(owner, SAHIH);

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist
        CrossUserAccess.assertInvisible(intruder, path, EDIT);

        assertThat(intruder.get(WORKS).body()).contains("\"total\":0").doesNotContain("صحيح البخاري");
        assertThat(owner.get(path).body()).contains("\"titleAr\":\"صحيح البخاري\"", "\"version\":0");
    }

    @Test
    void ownerIdAndVersionInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();
        UUID chosenId = UUID.randomUUID();

        HttpResponse<String> response = attacker.post(WORKS, """
                {"id":"%s","ownerId":"%s","owner_id":"%s","version":99,"titleEn":"Planted"}"""
                .formatted(chosenId, victim.accountId(), victim.accountId()));

        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(response.headers().firstValue("Location").orElseThrow()).doesNotContain(chosenId.toString());
            assertThat(response.body()).contains("\"version\":0");
            assertThat(worksOf(attacker)).isEqualTo(1);
        }
        assertThat(worksOf(victim)).isZero();
    }

    // ---- Adding, reading, editing and deleting -----------------------------------------------------------------

    @Test
    void aWorkCanBeAddedViewedEditedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String hadith = scienceNamed(reader, "Ḥadīth");
        String bukhari = addAuthor(reader, "{\"nameAr\":\"البخاري\",\"nameEn\":\"al-Bukhari\"}");
        String ibnHajar = addAuthor(reader, "{\"nameAr\":\"ابن حجر\",\"nameEn\":\"Ibn Hajar\"}");

        HttpResponse<String> created = reader.post(WORKS, """
                {"titleAr":"صحيح البخاري","titleEn":"Sahih al-Bukhari","scienceId":"%s","authorIds":["%s","%s"]}"""
                .formatted(hadith, bukhari, ibnHajar));

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String path = created.headers().firstValue("Location").orElseThrow();
        assertThat(path).matches(WORKS + "/[0-9a-f-]{36}");
        assertThat(created.headers().firstValue("ETag")).hasValue("\"0\"");
        String read = reader.get(path).body();
        assertThat(read)
                .contains("\"titleAr\":\"صحيح البخاري\"", "\"titleEn\":\"Sahih al-Bukhari\"", "\"version\":0")
                .contains("\"science\":{\"id\":\"" + hadith + "\",\"nameAr\":\"الحديث\",\"nameEn\":\"Ḥadīth\"}");
        assertThat(read.indexOf(bukhari)).as("authors in the order given").isLessThan(read.indexOf(ibnHajar));
        assertThat(read).contains("\"nameEn\":\"al-Bukhari\"", "\"nameEn\":\"Ibn Hajar\"");

        // A new order, and no science
        HttpResponse<String> edited = reader.put(path, """
                {"titleAr":"الجامع الصحيح","authorIds":["%s","%s"]}""".formatted(ibnHajar, bukhari), "\"0\"");
        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(edited.body()).contains("\"science\":null", "\"titleEn\":null", "\"version\":1");
        assertThat(edited.body().indexOf(ibnHajar)).isLessThan(edited.body().indexOf(bukhari));

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
        // Deleting a work leaves its authors and science alone
        assertThat(reader.get(AUTHORS + "/" + bukhari).statusCode()).isEqualTo(200);
        assertThat(reader.get(SCIENCES + "/" + hadith).statusCode()).isEqualTo(200);
    }

    @Test
    void authorsAreKeptInOrderOnceEach() throws Exception {
        ApiBrowser reader = newAccount();
        String first = addAuthor(reader, "{\"nameEn\":\"First\"}");
        String second = addAuthor(reader, "{\"nameEn\":\"Second\"}");

        HttpResponse<String> anonymous = reader.post(WORKS, "{\"titleAr\":\"كتاب مجهول المؤلف\",\"authorIds\":[]}");
        assertThat(anonymous.statusCode()).as(anonymous.body()).isEqualTo(201);
        assertThat(anonymous.body()).contains("\"authors\":[]");

        HttpResponse<String> twice = reader.post(WORKS, """
                {"titleEn":"Twice","authorIds":["%s","%s","%s"]}""".formatted(second, first, second));
        assertThat(twice.statusCode()).as(twice.body()).isEqualTo(201);
        String body = twice.body();
        assertThat(body.indexOf(second)).isLessThan(body.indexOf(first));
        assertThat(body.split(second, -1)).as("named once").hasSize(2);

        String tooMany = "[" + String.join(",", java.util.Collections.nCopies(21, "\"" + UUID.randomUUID() + "\"")) + "]";
        assertFieldError(reader.post(WORKS, "{\"titleEn\":\"x\",\"authorIds\":" + tooMany + "}"), "authorIds", "too_many");
        assertFieldError(reader.post(WORKS, "{\"titleEn\":\"x\",\"authorIds\":[null]}"), "authorIds", "invalid");
    }

    @Test
    void cantLinkAWorkToAnotherUsersAuthorOrScience() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String theirAuthor = addAuthor(owner, "{\"nameEn\":\"Private author\"}");
        String theirScience = scienceNamed(owner, "Fiqh");
        String missing = UUID.randomUUID().toString();

        HttpResponse<String> usingTheirAuthor = intruder.post(WORKS, withAuthor(theirAuthor));
        HttpResponse<String> usingMissingAuthor = intruder.post(WORKS, withAuthor(missing));
        HttpResponse<String> usingTheirScience = intruder.post(WORKS, withScience(theirScience));
        HttpResponse<String> usingMissingScience = intruder.post(WORKS, withScience(missing));

        // The same answers as for records that don't exist, so they don't reveal that the IDs are real
        assertFieldError(usingTheirAuthor, "authorIds", "unknown_author");
        assertThat(usingTheirAuthor.body()).isEqualTo(usingMissingAuthor.body());
        assertFieldError(usingTheirScience, "scienceId", "unknown_science");
        assertThat(usingTheirScience.body()).isEqualTo(usingMissingScience.body());

        String mine = addWork(intruder, SAHIH);
        assertFieldError(intruder.put(mine, withAuthor(theirAuthor), "\"0\""), "authorIds", "unknown_author");
        assertFieldError(intruder.put(mine, withScience(theirScience), "\"0\""), "scienceId", "unknown_science");
        assertThat(intruder.get(mine).body()).contains("\"version\":0", "\"authors\":[]", "\"science\":null");
        assertThat(worksOf(intruder)).isEqualTo(1);
    }

    @Test
    void titlesAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(WORKS, "{\"titleAr\":\" \",\"titleEn\":\"\"}"), "titleAr", "title_required");
        assertFieldError(reader.post(WORKS, "{\"titleEn\":\"" + "a".repeat(501) + "\"}"), "titleEn", "too_long");
        assertThat(reader.post(WORKS, "{\"titleAr\":\"" + "ب".repeat(500) + "\"}").statusCode()).isEqualTo(201);
        assertFieldError(reader.post(WORKS, "{\"titleEn\":\"Sa\\u202Ehih\"}"), "titleEn", "invalid_characters");
        assertFieldError(reader.post(WORKS, "{\"titleAr\":\"سطر\\nثان\"}"), "titleAr", "invalid_characters");

        assertThatThrownBy(() -> jdbc.sql("INSERT INTO works (id, owner_id) VALUES (:id, :owner)")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .as("a work with no title")
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO works (id, owner_id, title_en) VALUES (:id, :owner, repeat('a', 501))")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String path = addWork(laptop, SAHIH);

        assertThat(laptop.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, "{\"titleEn\":\"Edited on the phone\"}", "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("الجامع الصحيح").doesNotContain("Edited on the phone");
        HttpResponse<String> noVersion = phone.put(path, "{\"titleEn\":\"Edited on the phone\"}", null);
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(noVersion.body()).contains("\"code\":\"version_required\"");
    }

    // ---- Lists -------------------------------------------------------------------------------------------------

    @Test
    void listsOnlyShowYourOwnWorksInTitleOrder() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String fiqh = scienceNamed(reader, "Fiqh");
        String ibnQudamah = addAuthor(reader, "{\"nameEn\":\"Ibn Qudamah\"}");
        addWork(reader, "{\"titleAr\":\"المغني\",\"titleEn\":\"al-Mughni\",\"scienceId\":\"%s\",\"authorIds\":[\"%s\"]}"
                .formatted(fiqh, ibnQudamah));
        addWork(reader, "{\"titleAr\":\"عمدة الفقه\",\"titleEn\":\"Umdat al-Fiqh\",\"authorIds\":[\"%s\"]}"
                .formatted(ibnQudamah));
        addWork(reader, "{\"titleEn\":\"Bulugh al-Maram\",\"scienceId\":\"%s\"}".formatted(fiqh));
        addWork(other, "{\"titleEn\":\"Not yours\"}");

        String english = reader.get(WORKS + "?sort=en").body();
        assertThat(english).contains("\"total\":3").doesNotContain("Not yours");
        // Catalogue order: a leading "al-" is ignored, so al-Mughni is filed under M
        assertThat(english.indexOf("Bulugh al-Maram")).isLessThan(english.indexOf("al-Mughni"));
        assertThat(english.indexOf("al-Mughni")).isLessThan(english.indexOf("Umdat al-Fiqh"));
        assertThat(english).contains("\"nameEn\":\"Ibn Qudamah\"", "\"nameEn\":\"Fiqh\"");

        String arabic = reader.get(WORKS + "?sort=ar").body();
        // A leading "ال" is ignored too, so "المغني" is filed under mīm (م), after "عمدة الفقه" under ʿayn (ع)
        assertThat(arabic.indexOf("عمدة الفقه")).isPositive().isLessThan(arabic.indexOf("المغني"));

        assertThat(reader.get(WORKS + "?scienceId=" + fiqh).body()).contains("\"total\":2", "al-Mughni", "Bulugh")
                .doesNotContain("Umdat");
        assertThat(reader.get(WORKS + "?authorId=" + ibnQudamah).body()).contains("\"total\":2", "al-Mughni", "Umdat")
                .doesNotContain("Bulugh");
        assertThat(reader.get(WORKS + "?scienceId=" + fiqh + "&authorId=" + ibnQudamah).body())
                .contains("\"total\":1", "al-Mughni");
        // Filtering by someone else's science or author finds nothing of theirs
        assertThat(other.get(WORKS + "?scienceId=" + fiqh).body()).contains("\"total\":0");
        assertThat(other.get(WORKS + "?authorId=" + ibnQudamah).body()).contains("\"total\":0");

        String secondPage = reader.get(WORKS + "?sort=en&size=1&page=1").body();
        assertThat(secondPage).contains("al-Mughni", "\"page\":1", "\"size\":1", "\"total\":3")
                .doesNotContain("Bulugh", "Umdat");
    }

    @Test
    void listParametersAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.get(WORKS + "?size=500").body()).contains("\"size\":100");
        assertThat(reader.get(WORKS + "?size=0").body()).contains("\"size\":1");
        assertFieldError(reader.get(WORKS + "?page=-1"), "page", "invalid");
        assertFieldError(reader.get(WORKS + "?sort=fr"), "sort", "invalid");
        assertFieldError(reader.get(WORKS + "?scienceId=fiqh"), "scienceId", "invalid");
        assertFieldError(reader.get(WORKS + "?authorId=1"), "authorId", "invalid");
    }

    // ---- Records in use ----------------------------------------------------------------------------------------

    @Test
    void anAuthorNamedInAWorkCantBeDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String author = addAuthor(reader, "{\"nameEn\":\"Ibn Kathir\"}");
        String tafsir = addWork(reader, "{\"titleEn\":\"Tafsir\",\"authorIds\":[\"%s\"]}".formatted(author));
        addWork(reader, "{\"titleEn\":\"al-Bidayah wa al-Nihayah\",\"authorIds\":[\"%s\"]}".formatted(author));

        HttpResponse<String> inUse = reader.delete(AUTHORS + "/" + author);

        assertThat(inUse.statusCode()).isEqualTo(409);
        assertThat(inUse.body()).contains("\"code\":\"in_use\"", "\"usedBy\":{\"works\":2}").doesNotContain("Tafsir");
        assertThat(reader.get(AUTHORS + "/" + author).statusCode()).isEqualTo(200);

        assertThat(reader.delete(tafsir).statusCode()).isEqualTo(204);
        String other = jdbc.sql("SELECT id::text FROM works WHERE owner_id = :owner")
                .param("owner", reader.accountId())
                .query(String.class)
                .single();
        assertThat(reader.put(WORKS + "/" + other, "{\"titleEn\":\"al-Bidayah\",\"authorIds\":[]}", "\"0\"").statusCode())
                .isEqualTo(200);
        assertThat(reader.delete(AUTHORS + "/" + author).statusCode()).isEqualTo(204);
    }

    @Test
    void aScienceGivenToAWorkCantBeDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String fiqh = scienceNamed(reader, "Fiqh");
        String work = addWork(reader, "{\"titleEn\":\"al-Mughni\",\"scienceId\":\"%s\"}".formatted(fiqh));

        HttpResponse<String> inUse = reader.delete(SCIENCES + "/" + fiqh);

        assertThat(inUse.statusCode()).isEqualTo(409);
        assertThat(inUse.body()).contains("\"code\":\"in_use\"", "\"usedBy\":{\"works\":1}").doesNotContain("Mughni");
        assertThat(reader.put(work, "{\"titleEn\":\"al-Mughni\"}", "\"0\"").statusCode()).isEqualTo(200);
        assertThat(reader.delete(SCIENCES + "/" + fiqh).statusCode()).isEqualTo(204);
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, WorkService.MAX_WORKS_PER_ACCOUNT - 1);

        assertThat(reader.post(WORKS, SAHIH).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(WORKS, SAHIH);

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(worksOf(reader)).isEqualTo(WorkService.MAX_WORKS_PER_ACCOUNT);
        assertThat(newAccount().post(WORKS, SAHIH).statusCode()).as("other accounts aren't affected").isEqualTo(201);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimit() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, WorkService.MAX_WORKS_PER_ACCOUNT - 2);
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (ApiBrowser device : devices) {
                answers.add(pool.submit(() -> device.post(WORKS, SAHIH)));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(4);
        assertThat(worksOf(reader)).isEqualTo(WorkService.MAX_WORKS_PER_ACCOUNT);
    }

    @Test
    void oversizedBodiesAreRefused() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> response = reader.post(WORKS, "{\"titleEn\":\"" + "a".repeat(70_000) + "\"}");

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(worksOf(reader)).isZero();
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateTitle";

        List<HttpResponse<String>> responses = List.of(
                reader.post(WORKS, "{\"titleEn\":\"" + marker + "\\u202E\"}"),
                reader.post(WORKS, "{\"titleEn\":\"" + marker.repeat(50) + "\"}"),
                reader.post(WORKS, "{\"titleEn\":\"x\",\"scienceId\":\"" + marker + "\"}"),
                reader.post(WORKS, "{\"titleEn\":\"x\",\"authorIds\":[\"" + marker + "\"]}"),
                reader.get(WORKS + "?sort=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    @Test
    void deletingTheAccountRemovesTheWholeLibrary() throws Exception {
        ApiBrowser reader = newAccount();
        String village = created(reader.post(PLACES, "{\"nameEn\":\"Village\"}"));
        String author = addAuthor(reader, "{\"nameEn\":\"Local scholar\",\"birthPlaceId\":\"%s\"}"
                .formatted(village.substring(village.lastIndexOf('/') + 1)));
        addWork(reader, "{\"titleEn\":\"His book\",\"scienceId\":\"%s\",\"authorIds\":[\"%s\"]}"
                .formatted(scienceNamed(reader, "Fiqh"), author));

        // Everything links to everything else; the links are checked only once the transaction commits (V12)
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        for (String table : List.of("works", "authors", "places", "sciences")) {
            assertThat(jdbc.sql("SELECT count(*) FROM " + table + " WHERE owner_id = :owner")
                            .param("owner", reader.accountId())
                            .query(Long.class)
                            .single())
                    .as(table)
                    .isZero();
        }
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private String scienceNamed(ApiBrowser browser, String englishName) {
        return jdbc.sql("SELECT id::text FROM sciences WHERE owner_id = :owner AND name_en = :name")
                .param("owner", browser.accountId())
                .param("name", englishName)
                .query(String.class)
                .single();
    }

    /** Adds an author and returns their ID. */
    private static String addAuthor(ApiBrowser browser, String json) throws Exception {
        String path = created(browser.post(AUTHORS, json));
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /** Adds a work and returns its address. */
    private static String addWork(ApiBrowser browser, String json) throws Exception {
        return created(browser.post(WORKS, json));
    }

    /** Checks the answer is 201 and returns the new record's address. */
    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private void fill(ApiBrowser browser, int count) {
        jdbc.sql("""
                        INSERT INTO works (id, owner_id, title_en)
                        SELECT gen_random_uuid(), :owner, 'Work ' || n FROM generate_series(1, :count) AS n
                        """)
                .param("owner", browser.accountId())
                .param("count", count)
                .update();
    }

    private long worksOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM works WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private static String withAuthor(String authorId) {
        return "{\"titleEn\":\"Someone's book\",\"authorIds\":[\"" + authorId + "\"]}";
    }

    private static String withScience(String scienceId) {
        return "{\"titleEn\":\"Someone's book\",\"scienceId\":\"" + scienceId + "\"}";
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
