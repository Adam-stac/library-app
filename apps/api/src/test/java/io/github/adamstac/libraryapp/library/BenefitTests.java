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

/** Benefits (فوائد), over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class BenefitTests {

    static final String BENEFITS = "/api/v1/benefits";
    static final String EDITIONS = "/api/v1/editions";
    static final String WORKS = "/api/v1/works";

    static final String NIYYAH = "{\"text\":\"إنما الأعمال بالنيات\\nالبخاري يفتتح صحيحه به.\"}";
    static final String EDIT = "{\"text\":\"Every deed is judged by its intention.\"}";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void benefitsNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = BENEFITS + "/" + UUID.randomUUID();

        assertThat(nobody.get(BENEFITS).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(BENEFITS, NIYYAH).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void benefitChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String path = created(reader.post(BENEFITS, NIYYAH));

        assertThat(reader.send("POST", BENEFITS, NIYYAH, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, EDIT, "\"0\"", false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(path).body()).contains("\"version\":0", "إنما الأعمال بالنيات");
        assertThat(benefitsOf(reader)).isEqualTo(1);
    }

    @Test
    void anotherUsersBenefitsAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String path = created(owner.post(BENEFITS, NIYYAH));

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist
        CrossUserAccess.assertInvisible(intruder, path, EDIT);

        assertThat(intruder.get(BENEFITS).body()).contains("\"total\":0").doesNotContain("بالنيات");
        assertThat(owner.get(path).body()).contains("إنما الأعمال بالنيات", "\"version\":0");
    }

    @Test
    void theSourceOwnerIdAndVersionInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();

        HttpResponse<String> response = attacker.post(BENEFITS, """
                {"text":"Planted","source":"hasib","ownerId":"%s","version":99}""".formatted(victim.accountId()));

        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(response.body()).contains("\"source\":\"app\"", "\"version\":0");
        }
        assertThat(benefitsOf(victim)).isZero();
    }

    // ---- Adding, reading, editing and deleting -----------------------------------------------------------------

    @Test
    void aBenefitCanBeAddedViewedEditedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addEdition(reader, 13);

        HttpResponse<String> response = reader.post(BENEFITS, """
                {"text":"باب: العلم قبل القول والعمل","editionId":"%s","volume":1,"page":159}""".formatted(idFrom(edition)));

        String path = created(response);
        assertThat(response.headers().firstValue("ETag")).hasValue("\"0\"");
        assertThat(reader.get(path).body())
                .contains("\"text\":\"باب: العلم قبل القول والعمل\"", "\"volume\":1", "\"page\":159")
                .contains("\"source\":\"app\"", "\"version\":0", "\"id\":\"" + idFrom(edition) + "\"")
                .contains("\"titleEn\":\"Fath al-Bari\"", "\"volumes\":13");

        // Several lines are fine; leaving out the edition removes the link
        HttpResponse<String> edited = reader.put(path, NIYYAH, "\"0\"");
        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(edited.body()).contains("\\nالبخاري يفتتح صحيحه به.", "\"edition\":null", "\"volume\":null")
                .contains("\"version\":1");

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
    }

    @Test
    void theTextIsChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(BENEFITS, "{}"), "text", "required");
        assertFieldError(reader.post(BENEFITS, "{\"text\":\"  \\n  \"}"), "text", "required");
        assertFieldError(reader.post(BENEFITS, "{\"text\":\"" + "a".repeat(5001) + "\"}"), "text", "too_long");
        assertThat(reader.post(BENEFITS, "{\"text\":\"" + "ب".repeat(5000) + "\"}").statusCode()).isEqualTo(201);
        assertFieldError(reader.post(BENEFITS, "{\"text\":\"hidden\\u202Edirection\"}"), "text", "invalid_characters");
        assertFieldError(reader.post(BENEFITS, "{\"text\":\"nul\\u0000\"}"), "text", "invalid_characters");

        HttpResponse<String> normalised = reader.post(BENEFITS, "{\"text\":\"  \\u0627\\u0654حمد  \"}");
        assertThat(normalised.body()).contains("\"text\":\"أحمد\"");

        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO benefits (id, owner_id, body, source) VALUES (:id, :owner, 'x', 'whatsapp')""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .as("only the sources the server sets")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void whereABenefitCameFromIsChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String set = idFrom(addEdition(reader, 13));
        String single = idFrom(addEdition(reader, 1));

        assertFieldError(reader.post(BENEFITS, "{\"text\":\"x\",\"page\":5}"), "editionId", "edition_required");
        assertFieldError(reader.post(BENEFITS, "{\"text\":\"x\",\"volume\":2}"), "editionId", "edition_required");
        assertFieldError(reader.post(BENEFITS, from(set, "\"volume\":14,\"page\":5")), "volume", "invalid_number");
        assertFieldError(reader.post(BENEFITS, from(set, "\"page\":5")), "volume", "volume_required");
        assertFieldError(reader.post(BENEFITS, from(set, "\"volume\":2,\"page\":0")), "page", "invalid_number");
        assertThat(reader.post(BENEFITS, from(set, "\"volume\":2")).statusCode()).as("a volume without a page").isEqualTo(201);
        assertThat(reader.post(BENEFITS, from(set, "")).statusCode()).as("just the book").isEqualTo(201);
        assertThat(reader.post(BENEFITS, from(single, "\"volume\":1,\"page\":5")).body()).contains("\"volume\":null");
    }

    @Test
    void cantNameAnotherUsersEdition() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String theirs = idFrom(addEdition(owner, 1));

        HttpResponse<String> usingTheirs = intruder.post(BENEFITS, from(theirs, "\"page\":1"));
        HttpResponse<String> usingMissing = intruder.post(BENEFITS, from(UUID.randomUUID().toString(), "\"page\":1"));

        // The same answer as for an edition that doesn't exist, so it doesn't reveal that the ID is real
        assertFieldError(usingTheirs, "editionId", "unknown_edition");
        assertThat(usingTheirs.body()).isEqualTo(usingMissing.body());
        String mine = created(intruder.post(BENEFITS, NIYYAH));
        assertFieldError(intruder.put(mine, from(theirs, ""), "\"0\""), "editionId", "unknown_edition");
        assertThat(benefitsOf(intruder)).isEqualTo(1);
        assertThat(intruder.get(BENEFITS + "?editionId=" + theirs).body()).contains("\"total\":0");
    }

    @Test
    void deletingTheEditionKeepsTheBenefit() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addEdition(reader, 13);
        String path = created(reader.post(BENEFITS, from(idFrom(edition), "\"volume\":3,\"page\":12")));

        assertThat(reader.delete(edition).statusCode()).isEqualTo(204);

        // Kept, with the volume and page as a note of where it came from
        assertThat(reader.get(path).body()).contains("\"edition\":null", "\"volume\":3", "\"page\":12");
    }

    @Test
    void anEditCantLeaveABenefitInAVolumeThatIsGone() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"al-Mughni\"}")));
        String edition = created(reader.post(EDITIONS, "{\"workId\":\"" + work + "\",\"volumes\":15}"));
        created(reader.post(BENEFITS, from(idFrom(edition), "\"volume\":9")));

        assertFieldError(
                reader.put(edition, "{\"workId\":\"" + work + "\",\"volumes\":8}", "\"0\""), "volumes", "below_benefit");
        assertThat(reader.put(edition, "{\"workId\":\"" + work + "\",\"volumes\":9}", "\"0\"").statusCode()).isEqualTo(200);
    }

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String path = created(laptop.post(BENEFITS, NIYYAH));

        assertThat(laptop.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, "{\"text\":\"Edited on the phone\"}", "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("judged by its intention").doesNotContain("Edited on the phone");
        assertThat(phone.put(path, EDIT, null).body()).contains("\"code\":\"version_required\"");
    }

    // ---- Lists -------------------------------------------------------------------------------------------------

    @Test
    void listsShowYourOwnBenefitsNewestFirst() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String edition = idFrom(addEdition(reader, 1));
        created(reader.post(BENEFITS, "{\"text\":\"First benefit\"}"));
        created(reader.post(BENEFITS, from(edition, "\"page\":3").replace("\"text\":\"x\"", "\"text\":\"Second benefit\"")));
        created(reader.post(BENEFITS, "{\"text\":\"Third benefit\"}"));
        created(other.post(BENEFITS, "{\"text\":\"Not yours\"}"));

        String all = reader.get(BENEFITS).body();
        assertThat(all).contains("\"total\":3").doesNotContain("Not yours");
        assertThat(all.indexOf("Third benefit")).isLessThan(all.indexOf("Second benefit"));
        assertThat(all.indexOf("Second benefit")).isLessThan(all.indexOf("First benefit"));

        assertThat(reader.get(BENEFITS + "?editionId=" + edition).body()).contains("\"total\":1", "Second benefit")
                .doesNotContain("First benefit");
        assertThat(reader.get(BENEFITS + "?size=1&page=1").body()).contains("Second benefit", "\"size\":1");
        assertThat(reader.get(BENEFITS + "?size=500").body()).contains("\"size\":100");
        assertFieldError(reader.get(BENEFITS + "?page=-1"), "page", "invalid");
        assertFieldError(reader.get(BENEFITS + "?editionId=book"), "editionId", "invalid");
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, BenefitService.MAX_BENEFITS_PER_ACCOUNT - 1);

        assertThat(reader.post(BENEFITS, NIYYAH).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(BENEFITS, NIYYAH);

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(benefitsOf(reader)).isEqualTo(BenefitService.MAX_BENEFITS_PER_ACCOUNT);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimit() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, BenefitService.MAX_BENEFITS_PER_ACCOUNT - 2);
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (ApiBrowser device : devices) {
                answers.add(pool.submit(() -> device.post(BENEFITS, NIYYAH)));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(4);
        assertThat(benefitsOf(reader)).isEqualTo(BenefitService.MAX_BENEFITS_PER_ACCOUNT);
    }

    @Test
    void malformedRequestsAreRejectedCleanly() throws Exception {
        ApiBrowser reader = newAccount();
        String path = created(reader.post(BENEFITS, NIYYAH));

        for (String body : new String[] {"", "{", "null", "[]", "42", "\"text\"", "{\"text\":{}}", "{\"text\":[\"a\"]}",
            "{\"text\":\"x\",\"editionId\":\"book\"}", "{\"text\":\"x\",\"page\":\"five\"}", "{\"text\":\"x\",\"page\":1e30}"}) {
            for (HttpResponse<String> response : List.of(reader.post(BENEFITS, body), reader.put(path, body, "\"0\""))) {
                assertThat(response.statusCode()).as(body).isIn(400, 415);
                assertThat(response.body()).as(body).doesNotContainIgnoringCase("exception");
            }
        }
        assertThat(reader.post(BENEFITS, "{\"text\":\"" + "a".repeat(70_000) + "\"}").statusCode()).isEqualTo(413);
        assertThat(reader.send("POST", BENEFITS, NIYYAH, "text/plain", null, true).statusCode()).isEqualTo(415);
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateBenefit";

        List<HttpResponse<String>> responses = List.of(
                reader.post(BENEFITS, "{\"text\":\"" + marker + "\\u202E\"}"),
                reader.post(BENEFITS, "{\"text\":\"" + marker.repeat(400) + "\"}"),
                reader.post(BENEFITS, "{\"text\":\"x\",\"editionId\":\"" + marker + "\"}"),
                reader.get(BENEFITS + "?size=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    @Test
    void deletingTheAccountRemovesItsBenefits() throws Exception {
        ApiBrowser reader = newAccount();
        created(reader.post(BENEFITS, from(idFrom(addEdition(reader, 1)), "\"page\":1")));
        created(reader.post(BENEFITS, NIYYAH));

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(benefitsOf(reader)).isZero();
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    /** Adds an edition of a new work, "Fath al-Bari", with this many volumes, and returns its address. */
    private static String addEdition(ApiBrowser browser, int volumes) throws Exception {
        String work = idFrom(created(browser.post(WORKS, "{\"titleEn\":\"Fath al-Bari\"}")));
        return created(browser.post(EDITIONS, "{\"workId\":\"" + work + "\",\"volumes\":" + volumes + "}"));
    }

    /** A benefit with the text "x" from this edition; {@code more} is extra JSON fields, without a leading comma. */
    private static String from(String editionId, String more) {
        return "{\"text\":\"x\",\"editionId\":\"" + editionId + "\"" + (more.isEmpty() ? "" : "," + more) + "}";
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private void fill(ApiBrowser browser, int count) {
        jdbc.sql("""
                        INSERT INTO benefits (id, owner_id, body, source)
                        SELECT gen_random_uuid(), :owner, 'Benefit ' || n, 'app' FROM generate_series(1, :count) AS n
                        """)
                .param("owner", browser.accountId())
                .param("count", count)
                .update();
    }

    private long benefitsOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM benefits WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
