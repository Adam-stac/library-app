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

/** Sciences, over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class ScienceTests {

    static final String SCIENCES = "/api/v1/sciences";
    static final Pattern ID = Pattern.compile("\"id\":\"([0-9a-f-]{36})\"");

    // Not on the starter list, so adding them never clashes with a starter science
    static final String FARAID = "{\"nameAr\":\"الفرائض\",\"nameEn\":\"Inheritance (Farāʾiḍ)\"}";
    static final String EDIT = "{\"nameAr\":\"علم الفرائض\",\"nameEn\":\"Farāʾiḍ\"}";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- The starter list --------------------------------------------------------------------------------------

    @Test
    void aNewAccountStartsWithItsOwnCopyOfTheStarterList() throws Exception {
        ApiBrowser reader = newAccount();
        long starter = jdbc.sql("SELECT count(*) FROM starter_sciences").query(Long.class).single();

        String list = reader.get(SCIENCES + "?sort=en").body();

        assertThat(starter).isGreaterThanOrEqualTo(10);
        assertThat(list).contains("\"total\":" + starter, "\"nameAr\":\"الفقه\"", "\"nameEn\":\"Fiqh\"");
        assertThat(list.indexOf("\"nameEn\":\"Arabic language\"")).isLessThan(list.indexOf("\"nameEn\":\"Fiqh\""));
        assertThat(sciencesOf(reader)).isEqualTo(starter);
    }

    @Test
    void changingYourListLeavesOtherAccountsAndTheStarterListAlone() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser neighbour = newAccount();
        String fiqh = scienceNamed(reader, "Fiqh");
        long starter = jdbc.sql("SELECT count(*) FROM starter_sciences").query(Long.class).single();

        assertThat(reader.put(SCIENCES + "/" + fiqh, "{\"nameEn\":\"Ḥanbalī fiqh\"}", "\"0\"").statusCode())
                .isEqualTo(200);
        assertThat(reader.delete(SCIENCES + "/" + scienceNamed(reader, "Sīrah")).statusCode()).isEqualTo(204);

        assertThat(reader.get(SCIENCES).body()).contains("Ḥanbalī fiqh", "\"total\":" + (starter - 1))
                .doesNotContain("\"nameEn\":\"Fiqh\"", "Sīrah");
        assertThat(neighbour.get(SCIENCES).body()).contains("\"nameEn\":\"Fiqh\"", "Sīrah", "\"total\":" + starter);
        assertThat(newAccount().get(SCIENCES).body()).contains("\"nameEn\":\"Fiqh\"", "\"total\":" + starter);
        assertThat(jdbc.sql("SELECT count(*) FROM starter_sciences").query(Long.class).single()).isEqualTo(starter);
    }

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void sciencesNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = SCIENCES + "/" + UUID.randomUUID();

        assertThat(nobody.get(SCIENCES).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(SCIENCES, FARAID).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void scienceChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String path = SCIENCES + "/" + add(reader, FARAID);
        long before = sciencesOf(reader);

        assertThat(reader.send("POST", SCIENCES, EDIT, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, EDIT, "\"0\"", false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(path).body()).contains("\"version\":0", "الفرائض");
        assertThat(sciencesOf(reader)).isEqualTo(before);
    }

    @Test
    void anotherUsersSciencesAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String id = add(owner, FARAID);

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist
        CrossUserAccess.assertInvisible(intruder, SCIENCES + "/" + id, EDIT);

        assertThat(intruder.get(SCIENCES).body()).doesNotContain(id, "الفرائض");
        assertThat(owner.get(SCIENCES + "/" + id).body()).contains("\"nameAr\":\"الفرائض\"", "\"version\":0");
    }

    @Test
    void ownerIdAndVersionInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();
        long victimBefore = sciencesOf(victim);
        long attackerBefore = sciencesOf(attacker);
        UUID chosenId = UUID.randomUUID();

        HttpResponse<String> response = attacker.post(SCIENCES, """
                {"id":"%s","ownerId":"%s","owner_id":"%s","version":99,"nameEn":"Planted"}"""
                .formatted(chosenId, victim.accountId(), victim.accountId()));

        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(idOf(response.body())).isNotEqualTo(chosenId.toString());
            assertThat(response.body()).contains("\"version\":0");
            assertThat(sciencesOf(attacker)).isEqualTo(attackerBefore + 1);
        }
        assertThat(sciencesOf(victim)).isEqualTo(victimBefore);
    }

    // ---- Adding, reading, renaming and deleting ----------------------------------------------------------------

    @Test
    void aScienceCanBeAddedViewedRenamedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> created = reader.post(SCIENCES, FARAID);

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String path = SCIENCES + "/" + idOf(created.body());
        assertThat(created.headers().firstValue("Location")).hasValue(path);
        assertThat(created.headers().firstValue("ETag")).hasValue("\"0\"");
        assertThat(reader.get(path).body())
                .contains("\"nameAr\":\"الفرائض\"", "\"nameEn\":\"Inheritance (Farāʾiḍ)\"", "\"version\":0");

        HttpResponse<String> renamed = reader.put(path, EDIT, "\"0\"");
        assertThat(renamed.statusCode()).as(renamed.body()).isEqualTo(200);
        assertThat(renamed.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(renamed.body()).contains("\"nameAr\":\"علم الفرائض\"", "\"nameEn\":\"Farāʾiḍ\"", "\"version\":1");

        // Leaving a name out clears it
        HttpResponse<String> arabicOnly = reader.put(path, "{\"nameAr\":\"علم الفرائض\"}", "\"1\"");
        assertThat(arabicOnly.body()).contains("\"nameEn\":null");

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
    }

    @Test
    void atLeastOneNameIsNeeded() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(SCIENCES, "{\"nameAr\":\"  \",\"nameEn\":\"\"}"), "nameAr", "name_required");
        assertThat(reader.post(SCIENCES, "{\"nameEn\":\"Uṣūl al-Dīn\"}").statusCode()).isEqualTo(201);
    }

    @Test
    void twoSciencesCantShareAName() throws Exception {
        ApiBrowser reader = newAccount();
        long before = sciencesOf(reader);

        // The same as a starter science: Arabic exactly (after trimming and normalising), English ignoring case
        assertFieldError(reader.post(SCIENCES, "{\"nameAr\":\" الفقه \"}"), "nameAr", "already_used");
        assertFieldError(reader.post(SCIENCES, "{\"nameEn\":\"FIQH\"}"), "nameEn", "already_used");
        assertFieldError(reader.post(SCIENCES, "{\"nameAr\":\"فقه جديد\",\"nameEn\":\"fiqh\"}"), "nameEn", "already_used");
        assertThat(sciencesOf(reader)).isEqualTo(before);

        // Renaming into another science's name is refused; keeping your own name is fine
        String faraid = add(reader, FARAID);
        assertFieldError(reader.put(SCIENCES + "/" + faraid, "{\"nameEn\":\"Ḥadīth\"}", "\"0\""), "nameEn", "already_used");
        assertThat(reader.put(SCIENCES + "/" + faraid, FARAID, "\"0\"").statusCode()).isEqualTo(200);

        // Another account can use the same names
        assertThat(newAccount().post(SCIENCES, FARAID).statusCode()).isEqualTo(201);

        // The database refuses a duplicate too, if the API ever let one through
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO sciences (owner_id, name_en) VALUES (:owner, 'fIqH')")
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void namesAreCheckedLikeAnyOtherText() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(SCIENCES, "{\"nameEn\":\"" + "a".repeat(101) + "\"}"), "nameEn", "too_long");
        assertThat(reader.post(SCIENCES, "{\"nameAr\":\"" + "ب".repeat(100) + "\"}").statusCode()).isEqualTo(201);
        assertFieldError(reader.post(SCIENCES, "{\"nameEn\":\"Fi\\u202Eqh\"}"), "nameEn", "invalid_characters");
        assertFieldError(reader.post(SCIENCES, "{\"nameAr\":\"سطر\\nثان\"}"), "nameAr", "invalid_characters");

        HttpResponse<String> normalised = reader.post(SCIENCES, "{\"nameAr\":\"  \\u0627\\u0654دب الطلب  \"}");
        assertThat(normalised.statusCode()).as(normalised.body()).isEqualTo(201);
        assertThat(normalised.body()).contains("\"nameAr\":\"أدب الطلب\"");

        assertThatThrownBy(() -> jdbc.sql("INSERT INTO sciences (owner_id) VALUES (:owner)")
                        .param("owner", reader.accountId())
                        .update())
                .as("a science with no name")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String path = SCIENCES + "/" + add(laptop, FARAID);

        assertThat(laptop.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, "{\"nameEn\":\"Edited on the phone\"}", "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("علم الفرائض").doesNotContain("Edited on the phone");
        HttpResponse<String> noVersion = phone.put(path, "{\"nameEn\":\"Edited on the phone\"}", null);
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(noVersion.body()).contains("\"code\":\"version_required\"");
    }

    @Test
    void listParametersAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.get(SCIENCES + "?sort=fr"), "sort", "invalid");
        String arabic = reader.get(SCIENCES + "?sort=ar").body();
        assertThat(arabic.indexOf("\"nameAr\":\"الحديث\""))
                .as("ح comes before ف")
                .isLessThan(arabic.indexOf("\"nameAr\":\"الفقه\""));
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        fillTo(reader, ScienceService.MAX_SCIENCES_PER_ACCOUNT - 1);

        assertThat(reader.post(SCIENCES, FARAID).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(SCIENCES, EDIT);

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(sciencesOf(reader)).isEqualTo(ScienceService.MAX_SCIENCES_PER_ACCOUNT);
        assertThat(reader.get(SCIENCES).body()).contains("\"total\":" + ScienceService.MAX_SCIENCES_PER_ACCOUNT);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimitOrRepeatAName() throws Exception {
        ApiBrowser reader = newAccount();
        fillTo(reader, ScienceService.MAX_SCIENCES_PER_ACCOUNT - 2);
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        // Six devices: three send one new name, three another; only one of each may succeed
        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (int i = 0; i < devices.size(); i++) {
                ApiBrowser device = devices.get(i);
                String body = i % 2 == 0 ? FARAID : EDIT;
                answers.add(pool.submit(() -> device.post(SCIENCES, body)));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 400 || status == 409).hasSize(4);
        assertThat(sciencesOf(reader)).isEqualTo(ScienceService.MAX_SCIENCES_PER_ACCOUNT);
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateScience";

        List<HttpResponse<String>> responses = List.of(
                reader.post(SCIENCES, "{\"nameEn\":\"" + marker + "\\u202E\"}"),
                reader.post(SCIENCES, "{\"nameEn\":\"" + marker.repeat(10) + "\"}"),
                reader.post(SCIENCES, "{\"nameEn\":[\"" + marker + "\"]}"),
                reader.get(SCIENCES + "?sort=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }

        // A name already in use is refused without repeating it
        assertThat(reader.post(SCIENCES, "{\"nameEn\":\"" + marker + "\"}").statusCode()).isEqualTo(201);
        HttpResponse<String> again = reader.post(SCIENCES, "{\"nameEn\":\"" + marker + "\"}");
        assertThat(again.statusCode()).isEqualTo(400);
        assertThat(again.body()).doesNotContain(marker);
    }

    @Test
    void deletingTheAccountRemovesItsSciences() throws Exception {
        ApiBrowser reader = newAccount();
        add(reader, FARAID);

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(sciencesOf(reader)).isZero();
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

    private static String add(ApiBrowser browser, String json) throws Exception {
        HttpResponse<String> response = browser.post(SCIENCES, json);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return idOf(response.body());
    }

    static String idOf(String body) {
        Matcher id = ID.matcher(body);
        assertThat(id.find()).as(body).isTrue();
        return id.group(1);
    }

    /** Adds made-up sciences until the account has {@code total}. */
    private void fillTo(ApiBrowser browser, int total) {
        jdbc.sql("""
                        INSERT INTO sciences (owner_id, name_en)
                        SELECT :owner, 'Science ' || n FROM generate_series(1, :count) AS n
                        """)
                .param("owner", browser.accountId())
                .param("count", total - sciencesOf(browser))
                .update();
    }

    private long sciencesOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM sciences WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
