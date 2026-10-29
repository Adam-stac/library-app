package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The bin (ADR 0009): deleted books and benefits are kept for 30 days and can be put back as they were. Over real
 * HTTP with a real Postgres; each test makes its own accounts. Threat model: library.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class BinTests {

    static final String BIN = "/api/v1/bin";
    static final String WORKS = "/api/v1/works";
    static final String EDITIONS = "/api/v1/editions";
    static final String BENEFITS = "/api/v1/benefits";
    static final String AUTHORS = "/api/v1/authors";
    static final String SCIENCES = "/api/v1/sciences";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private BinService bin;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void theBinNeedsSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String item = BIN + "/" + UUID.randomUUID();

        assertThat(nobody.get(BIN).statusCode()).isEqualTo(401);
        assertThat(nobody.post(item + "/restore", null).statusCode()).isEqualTo(401);
        assertThat(nobody.delete(item).statusCode()).isEqualTo(401);
        assertThat(nobody.delete(BIN).statusCode()).isEqualTo(401);
    }

    @Test
    void binChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String benefit = idFrom(created(reader.post(BENEFITS, "{\"text\":\"kept\"}")));
        assertThat(reader.delete(BENEFITS + "/" + benefit).statusCode()).isEqualTo(204);

        assertThat(reader.send("POST", BIN + "/" + benefit + "/restore", null, null, false).statusCode())
                .isEqualTo(403);
        assertThat(reader.send("DELETE", BIN + "/" + benefit, null, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", BIN, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(BIN).body()).contains("\"total\":1", "\"excerpt\":\"kept\"");
    }

    @Test
    void anotherUsersBinIsInvisibleAndUntouchable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String benefit = idFrom(created(owner.post(BENEFITS, "{\"text\":\"private\"}")));
        owner.delete(BENEFITS + "/" + benefit);
        String missing = UUID.randomUUID().toString();

        HttpResponse<String> theirs = intruder.post(BIN + "/" + benefit + "/restore", null);
        HttpResponse<String> none = intruder.post(BIN + "/" + missing + "/restore", null);
        assertThat(theirs.statusCode()).isEqualTo(404);
        assertThat(theirs.body().replace(benefit, "ID")).isEqualTo(none.body().replace(missing, "ID"));
        assertThat(intruder.delete(BIN + "/" + benefit).statusCode()).isEqualTo(404);
        assertThat(intruder.delete(BIN).statusCode()).isEqualTo(204); // empties only their own
        assertThat(intruder.get(BIN).body()).contains("\"total\":0").doesNotContain("private");

        assertThat(owner.get(BIN).body()).contains("\"total\":1", "private");
        assertThat(owner.post(BIN + "/" + benefit + "/restore", null).statusCode()).isEqualTo(200);
    }

    // ---- Books -------------------------------------------------------------------------------------------------

    @Test
    void aDeletedBookComesBackAsItWas() throws Exception {
        ApiBrowser reader = newAccount();
        String science = idFrom(created(reader.post(SCIENCES, "{\"nameAr\":\"الحديث النبوي\",\"nameEn\":\"Prophetic hadith\"}")));
        String author = idFrom(created(reader.post(AUTHORS, "{\"nameAr\":\"البخاري\",\"nameEn\":\"al-Bukhari\"}")));
        String work = idFrom(created(reader.post(WORKS, """
                {"titleAr":"صحيح البخاري","titleEn":"Sahih al-Bukhari","scienceId":"%s","authorIds":["%s"]}"""
                .formatted(science, author))));
        String edition = idFrom(created(reader.post(EDITIONS, """
                {"workId":"%s","volumes":9,"shelf":"A3","price":{"amount":"95.00","currency":"GBP"}}"""
                .formatted(work))));
        reader.put(EDITIONS + "/" + edition + "/bookmark", "{\"volume\":2,\"page\":50}", null);
        String benefit = idFrom(created(reader.post(BENEFITS, """
                {"text":"إنما الأعمال بالنيات","editionId":"%s","volume":2,"page":50}""".formatted(edition))));

        // Deleted with its work, as the last copy: gone from the library, kept in the bin
        assertThat(reader.delete(EDITIONS + "/" + edition + "?withWork=ifLast").statusCode()).isEqualTo(204);
        assertThat(reader.get(EDITIONS + "/" + edition).statusCode()).isEqualTo(404);
        assertThat(reader.get(WORKS + "/" + work).statusCode()).isEqualTo(404);
        assertThat(reader.get(BENEFITS + "/" + benefit).body()).contains("\"edition\":null", "\"volume\":2");
        assertThat(reader.get(EDITIONS).body()).contains("\"total\":0");
        assertThat(reader.get("/api/v1/search?q=" + "Bukhari").body()).doesNotContain(edition);
        assertThat(reader.get(BIN).body())
                .contains("\"total\":1", "\"kind\":\"book\"", "\"id\":\"" + edition + "\"")
                .contains("\"titleAr\":\"صحيح البخاري\"", "\"keptDays\":30", "\"removedAt\":");

        // Put back: the copy, its work with its science and author, the bookmark, and the benefit's link
        HttpResponse<String> restored = reader.post(BIN + "/" + edition + "/restore", null);
        assertThat(restored.statusCode()).as(restored.body()).isEqualTo(200);
        assertThat(restored.body()).contains("\"id\":\"" + edition + "\"", "\"kind\":\"book\"");
        assertThat(reader.get(EDITIONS + "/" + edition).body())
                .contains("\"shelf\":\"A3\"", "\"amount\":\"95.00\"", "\"volumes\":9", "\"page\":50")
                .contains("\"titleAr\":\"صحيح البخاري\"", "Prophetic hadith", "al-Bukhari");
        assertThat(reader.get(BENEFITS + "/" + benefit).body()).contains("\"id\":\"" + edition + "\"");
        assertThat(reader.get(BIN).body()).contains("\"total\":0");
        assertThat(reader.post(BIN + "/" + edition + "/restore", null).statusCode()).isEqualTo(404);
    }

    @Test
    void withoutBeingAskedTheWorkStays() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"al-Muwatta\"}")));
        String edition = addCopy(reader, work);

        assertThat(reader.delete(EDITIONS + "/" + edition).statusCode()).isEqualTo(204);

        assertThat(reader.get(WORKS + "/" + work).statusCode()).isEqualTo(200);
        assertThat(reader.post(BIN + "/" + edition + "/restore", null).statusCode()).isEqualTo(200);
        assertThat(reader.get(EDITIONS + "/" + edition).statusCode()).isEqualTo(200);
    }

    @Test
    void aWorkWithAnotherCopyStaysEvenWhenAsked() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"al-Muwatta\"}")));
        String first = addCopy(reader, work);
        addCopy(reader, work);

        assertThat(reader.delete(EDITIONS + "/" + first + "?withWork=ifLast").statusCode()).isEqualTo(204);

        assertThat(reader.get(WORKS + "/" + work).statusCode()).isEqualTo(200);
    }

    @Test
    void anyCopyOfAWorkInTheBinBringsTheWorkBack() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"al-Muwatta\"}")));
        String first = addCopy(reader, work);
        String second = addCopy(reader, work);
        reader.delete(EDITIONS + "/" + first + "?withWork=ifLast"); // the work stays: there's another copy
        reader.delete(EDITIONS + "/" + second + "?withWork=ifLast"); // the last copy: the work goes with it

        // The first copy comes back first: its work went to the bin with the second one
        assertThat(reader.post(BIN + "/" + first + "/restore", null).statusCode()).isEqualTo(200);
        assertThat(reader.get(WORKS + "/" + work).body()).contains("al-Muwatta");
        assertThat(reader.post(BIN + "/" + second + "/restore", null).statusCode()).isEqualTo(200);
        assertThat(reader.get(EDITIONS + "?workId=" + work).body()).contains("\"total\":2");
    }

    @Test
    void aBookWhoseWorkWasDeletedForGoodCantComeBack() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"al-Muwatta\"}")));
        String edition = addCopy(reader, work);
        reader.delete(EDITIONS + "/" + edition);
        reader.delete(WORKS + "/" + work);

        HttpResponse<String> response = reader.post(BIN + "/" + edition + "/restore", null);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("\"code\":\"work_gone\"");
        assertThat(reader.get(BIN).body()).contains("\"total\":1"); // still there, to delete for good
    }

    @Test
    void aScienceOrAuthorDeletedMeanwhileIsLeftOut() throws Exception {
        ApiBrowser reader = newAccount();
        String science = idFrom(created(reader.post(SCIENCES, "{\"nameEn\":\"Usul (bin test)\"}")));
        String author = idFrom(created(reader.post(AUTHORS, "{\"nameEn\":\"al-Shafii\"}")));
        String work = idFrom(created(reader.post(WORKS, """
                {"titleEn":"al-Risala","scienceId":"%s","authorIds":["%s"]}""".formatted(science, author))));
        String edition = addCopy(reader, work);
        reader.delete(EDITIONS + "/" + edition + "?withWork=ifLast");

        // Nothing uses them now, so they can be deleted
        assertThat(reader.delete(SCIENCES + "/" + science).statusCode()).isEqualTo(204);
        assertThat(reader.delete(AUTHORS + "/" + author).statusCode()).isEqualTo(204);

        assertThat(reader.post(BIN + "/" + edition + "/restore", null).statusCode()).isEqualTo(200);
        assertThat(reader.get(WORKS + "/" + work).body())
                .contains("al-Risala", "\"science\":null", "\"authors\":[]");
    }

    @Test
    void theWithWorkChoiceIsChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addCopy(reader, idFrom(created(reader.post(WORKS, "{\"titleEn\":\"x\"}"))));

        HttpResponse<String> response = reader.delete(EDITIONS + "/" + edition + "?withWork=always");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"withWork\"", "\"code\":\"invalid\"");
        assertThat(reader.get(EDITIONS + "/" + edition).statusCode()).isEqualTo(200);
    }

    // ---- Benefits ----------------------------------------------------------------------------------------------

    @Test
    void aDeletedBenefitComesBackWithItsBook() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addCopy(reader, idFrom(created(reader.post(WORKS, "{\"titleEn\":\"Fath al-Bari\"}"))));
        String benefit = idFrom(created(reader.post(BENEFITS, """
                {"text":"باب: العلم قبل القول والعمل","editionId":"%s","volume":1,"page":159}""".formatted(edition))));

        assertThat(reader.delete(BENEFITS + "/" + benefit).statusCode()).isEqualTo(204);
        assertThat(reader.get(BENEFITS + "/" + benefit).statusCode()).isEqualTo(404);
        assertThat(reader.get(BENEFITS).body()).contains("\"total\":0");
        assertThat(reader.get(BIN).body()).contains("\"kind\":\"benefit\"", "\"excerpt\":\"باب: العلم قبل القول والعمل\"");

        HttpResponse<String> restored = reader.post(BIN + "/" + benefit + "/restore", null);
        assertThat(restored.body()).contains("\"kind\":\"benefit\"");
        assertThat(reader.get(BENEFITS + "/" + benefit).body())
                .contains("\"version\":0", "\"page\":159", "\"id\":\"" + edition + "\"", "\"source\":\"app\"");
    }

    @Test
    void aBenefitWhoseBookIsGoneComesBackWithItsNote() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addCopy(reader, idFrom(created(reader.post(WORKS, "{\"titleEn\":\"Fath al-Bari\"}"))));
        String benefit = idFrom(created(reader.post(BENEFITS, """
                {"text":"x","editionId":"%s","volume":1,"page":12}""".formatted(edition))));
        reader.delete(BENEFITS + "/" + benefit);
        reader.delete(EDITIONS + "/" + edition);

        assertThat(reader.post(BIN + "/" + benefit + "/restore", null).statusCode()).isEqualTo(200);

        assertThat(reader.get(BENEFITS + "/" + benefit).body()).contains("\"edition\":null", "\"page\":12");
    }

    @Test
    void puttingBackKeepsToTheLimits() throws Exception {
        ApiBrowser reader = newAccount();
        String benefit = idFrom(created(reader.post(BENEFITS, "{\"text\":\"one too many\"}")));
        reader.delete(BENEFITS + "/" + benefit);
        jdbc.sql("""
                        INSERT INTO benefits (id, owner_id, body, source)
                        SELECT gen_random_uuid(), :owner, 'Benefit ' || n, 'app' FROM generate_series(1, :count) AS n
                        """)
                .param("owner", reader.accountId())
                .param("count", BenefitService.MAX_BENEFITS_PER_ACCOUNT)
                .update();

        HttpResponse<String> response = reader.post(BIN + "/" + benefit + "/restore", null);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("\"code\":\"limit_reached\"");
    }

    // ---- Deleting for good -------------------------------------------------------------------------------------

    @Test
    void anItemCanBeDeletedForGoodAndTheBinEmptied() throws Exception {
        ApiBrowser reader = newAccount();
        String one = idFrom(created(reader.post(BENEFITS, "{\"text\":\"one\"}")));
        String two = idFrom(created(reader.post(BENEFITS, "{\"text\":\"two\"}")));
        String three = idFrom(created(reader.post(BENEFITS, "{\"text\":\"three\"}")));
        for (String id : new String[] {one, two, three}) {
            reader.delete(BENEFITS + "/" + id);
        }

        assertThat(reader.delete(BIN + "/" + one).statusCode()).isEqualTo(204);
        assertThat(reader.delete(BIN + "/" + one).statusCode()).isEqualTo(404);
        assertThat(reader.post(BIN + "/" + one + "/restore", null).statusCode()).isEqualTo(404);
        assertThat(reader.get(BIN).body()).contains("\"total\":2");

        assertThat(reader.delete(BIN).statusCode()).isEqualTo(204);
        assertThat(reader.get(BIN).body()).contains("\"total\":0", "\"items\":[]");
        assertThat(itemsOf(reader)).isZero();
    }

    @Test
    void afterThirtyDaysItemsAreDeletedForGood() throws Exception {
        ApiBrowser reader = newAccount();
        String old = idFrom(created(reader.post(BENEFITS, "{\"text\":\"old\"}")));
        String recent = idFrom(created(reader.post(BENEFITS, "{\"text\":\"recent\"}")));
        reader.delete(BENEFITS + "/" + old);
        reader.delete(BENEFITS + "/" + recent);
        jdbc.sql("UPDATE bin SET deleted_at = now() - interval '30 days 1 minute' WHERE id = :id")
                .param("id", UUID.fromString(old))
                .update();

        // Past its time it is already out of reach, before the daily clear-out runs
        assertThat(reader.get(BIN).body()).contains("\"total\":1", "recent").doesNotContain("\"old\"");
        assertThat(reader.post(BIN + "/" + old + "/restore", null).statusCode()).isEqualTo(404);

        assertThat(bin.deleteExpired()).isGreaterThanOrEqualTo(1);
        assertThat(itemsOf(reader)).isEqualTo(1);
    }

    @Test
    void theBinKeepsToItsLimitByLettingTheOldestGo() throws Exception {
        ApiBrowser reader = newAccount();
        jdbc.sql("""
                        INSERT INTO bin (id, owner_id, kind, record, deleted_at)
                        SELECT gen_random_uuid(), :owner, 'benefit', '{}', now() - make_interval(secs => n)
                        FROM generate_series(1, :count) AS n
                        """)
                .param("owner", reader.accountId())
                .param("count", BinService.MAX_ITEMS)
                .update();
        String newest = idFrom(created(reader.post(BENEFITS, "{\"text\":\"newest\"}")));

        reader.delete(BENEFITS + "/" + newest);

        assertThat(itemsOf(reader)).isEqualTo(BinService.MAX_ITEMS);
        assertThat(reader.get(BIN).body()).contains("newest");
    }

    @Test
    void deletingTheAccountEmptiesItsBin() throws Exception {
        ApiBrowser reader = newAccount();
        String benefit = idFrom(created(reader.post(BENEFITS, "{\"text\":\"x\"}")));
        reader.delete(BENEFITS + "/" + benefit);

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(itemsOf(reader)).isZero();
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private static String addCopy(ApiBrowser browser, String workId) throws Exception {
        return idFrom(created(browser.post(EDITIONS, "{\"workId\":\"" + workId + "\",\"volumes\":13}")));
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private long itemsOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM bin WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }
}
