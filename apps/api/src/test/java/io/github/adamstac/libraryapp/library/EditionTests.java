package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.CrossUserAccess;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
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

/**
 * Editions (the copies on the shelf) and the library settings, over real HTTP with a real Postgres. Each test makes
 * its own accounts. Threat model: library. An edition's body also holds its work's ID, so a new edition's address
 * is read from the Location header.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class EditionTests {

    static final String EDITIONS = "/api/v1/editions";
    static final String WORKS = "/api/v1/works";
    static final String AUTHORS = "/api/v1/authors";
    static final String SETTINGS = "/api/v1/library-settings";
    static final String BY_ISBN = "/api/v1/editions/by-isbn?isbn=";
    /** An edition in a list starts with its own ID and then its work, which tells it from the IDs inside the work. */
    private static final Pattern EDITION_ID = Pattern.compile("\\{\"id\":\"([0-9a-f-]{36})\",\"work\":");

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void editionsAndSettingsNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = EDITIONS + "/" + UUID.randomUUID();

        assertThat(nobody.get(EDITIONS).statusCode()).isEqualTo(401);
        assertThat(nobody.get(BY_ISBN + "9780306406157").statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(EDITIONS, "{}").statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, "{}", "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
        assertThat(nobody.get(SETTINGS).statusCode()).isEqualTo(401);
        assertThat(nobody.put(SETTINGS, "{\"defaultCurrency\":\"GBP\"}", null).statusCode()).isEqualTo(401);
    }

    @Test
    void editionAndSettingsChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        String path = addEdition(reader, edition(work, ""));

        assertThat(reader.send("POST", EDITIONS, edition(work, ""), null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, edition(work, ",\"shelf\":\"Study\""), "\"0\"", false).statusCode())
                .isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", SETTINGS, "{\"defaultCurrency\":\"GBP\"}", null, false).statusCode())
                .isEqualTo(403);

        assertThat(reader.get(path).body()).contains("\"version\":0", "\"shelf\":null");
        assertThat(editionsOf(reader)).isEqualTo(1);
        assertThat(reader.get(SETTINGS).body()).contains("\"defaultCurrency\":null");
    }

    @Test
    void anotherUsersEditionsAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String path = addEdition(owner, edition(workId(owner), ",\"shelf\":\"Study, shelf 2\""));

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist. The edit names the
        // intruder's own work, so only the edition's owner can make it fail.
        CrossUserAccess.assertInvisible(intruder, path, edition(workId(intruder), ""));

        assertThat(intruder.get(EDITIONS).body()).contains("\"total\":0");
        assertThat(owner.get(path).body()).contains("\"shelf\":\"Study, shelf 2\"", "\"version\":0");
    }

    @Test
    void ownerIdVersionAndStatusInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();
        UUID chosenId = UUID.randomUUID();

        HttpResponse<String> response = attacker.post(EDITIONS, """
                {"id":"%s","ownerId":"%s","version":99,"status":"finished","workId":"%s"}"""
                .formatted(chosenId, victim.accountId(), workId(attacker)));

        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(response.headers().firstValue("Location").orElseThrow()).doesNotContain(chosenId.toString());
            assertThat(response.body()).contains("\"version\":0", "\"status\":\"not_started\"");
        }
        assertThat(editionsOf(victim)).isZero();
    }

    // ---- Adding, reading, editing and deleting -----------------------------------------------------------------

    @Test
    void anEditionCanBeAddedViewedEditedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String ibnHajar = idFrom(created(reader.post(AUTHORS, "{\"nameAr\":\"ابن حجر\",\"nameEn\":\"Ibn Hajar\"}")));
        String work = idFrom(created(reader.post(WORKS, """
                {"titleAr":"فتح الباري","titleEn":"Fath al-Bari","authorIds":["%s"]}""".formatted(ibnHajar))));

        HttpResponse<String> response = reader.post(EDITIONS, """
                {"workId":"%s","title":"فتح الباري شرح صحيح البخاري","language":"AR","muhaqqiq":"محمد فؤاد عبد الباقي",
                 "publisher":"دار المعرفة","publicationPlace":"بيروت","published":{"hijri":1379},
                 "editionNumber":1,"volumes":13,"isbn":"ردمك: ٩٧٨-٠-٣٠٦-٤٠٦١٥-٧","legalDeposit":"١٩٥٩/٢٣",
                 "shelf":"Study, shelf 2","notes":"Bought from a friend.\\nVolume 3 has notes in the margin.",
                 "purchasedOn":"2024-03-12","price":{"amount":"95.5","currency":"gbp"},"startedOn":"2026-01-03"}"""
                .formatted(work));

        String path = created(response);
        assertThat(path).matches(EDITIONS + "/[0-9a-f-]{36}");
        assertThat(response.headers().firstValue("ETag")).hasValue("\"0\"");
        String read = reader.get(path).body();
        assertThat(read)
                .contains("\"title\":\"فتح الباري شرح صحيح البخاري\"", "\"language\":\"ar\"", "\"volumes\":13")
                .contains("\"isbn\":\"9780306406157\"", "\"legalDeposit\":\"1959/23\"", "\"editionNumber\":1")
                .contains("\"purchasedOn\":\"2024-03-12\"", "\"startedOn\":\"2026-01-03\"", "\"finishedOn\":null")
                .contains("\"status\":\"reading\"", "\"version\":0", "Volume 3 has notes in the margin.")
                .contains("\"titleEn\":\"Fath al-Bari\"", "\"nameEn\":\"Ibn Hajar\"", "\"id\":\"" + work + "\"")
                .containsPattern("\"price\":\\{[^}]*\"amount\":\"95.50\"")
                .containsPattern("\"price\":\\{[^}]*\"currency\":\"GBP\"")
                .containsPattern("\"published\":\\{[^}]*\"hijri\":1379")
                .containsPattern("\"published\":\\{[^}]*\"ce\":null");

        // Finished reading; fields left out of an edit are cleared
        HttpResponse<String> edited = reader.put(path, """
                {"workId":"%s","volumes":13,"startedOn":"2026-01-03","finishedOn":"2026-02-01"}""".formatted(work), "\"0\"");
        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(edited.body())
                .contains("\"status\":\"finished\"", "\"finishedOn\":\"2026-02-01\"", "\"price\":null")
                .contains("\"isbn\":null", "\"title\":null", "\"version\":1");

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
        assertThat(reader.get(WORKS + "/" + work).statusCode()).as("the work stays").isEqualTo(200);
    }

    @Test
    void aBookCanBeAddedWithANewWorkInOneGo() throws Exception {
        ApiBrowser reader = newAccount();
        String author = idFrom(created(reader.post(AUTHORS, "{\"nameEn\":\"al-Nawawi\"}")));

        HttpResponse<String> response = reader.post(EDITIONS, """
                {"work":{"titleAr":"رياض الصالحين","titleEn":"Riyad al-Salihin","authorIds":["%s"]},"volumes":1}"""
                .formatted(author));

        created(response);
        assertThat(response.body()).contains("\"titleAr\":\"رياض الصالحين\"", "\"nameEn\":\"al-Nawawi\"", "\"status\":\"not_started\"");
        assertThat(worksOf(reader)).isEqualTo(1);

        // Problems with the new work are reported as its fields; nothing is added
        assertFieldError(reader.post(EDITIONS, "{\"work\":{\"titleAr\":\" \"}}"), "work.titleAr", "title_required");
        assertFieldError(
                reader.post(EDITIONS, "{\"work\":{\"titleEn\":\"x\",\"authorIds\":[\"" + UUID.randomUUID() + "\"]}}"),
                "work.authorIds",
                "unknown_author");
        // A problem with the edition adds neither
        assertFieldError(reader.post(EDITIONS, "{\"work\":{\"titleEn\":\"New\"},\"isbn\":\"12345\"}"), "isbn", "invalid_isbn");
        assertThat(worksOf(reader)).isEqualTo(1);
        assertThat(editionsOf(reader)).isEqualTo(1);

        // Exactly one of workId and work
        assertFieldError(reader.post(EDITIONS, "{\"volumes\":1}"), "workId", "work_required");
        assertFieldError(
                reader.post(EDITIONS, "{\"workId\":\"%s\",\"work\":{\"titleEn\":\"y\"}}".formatted(workId(reader))),
                "workId",
                "work_or_work_id");
        String path = response.headers().firstValue("Location").orElseThrow();
        assertFieldError(reader.put(path, "{\"work\":{\"titleEn\":\"z\"}}", "\"0\""), "work", "not_allowed");
    }

    @Test
    void cantAddAnEditionToAnotherUsersWork() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String theirs = workId(owner);

        HttpResponse<String> usingTheirs = intruder.post(EDITIONS, edition(theirs, ""));
        HttpResponse<String> usingMissing = intruder.post(EDITIONS, edition(UUID.randomUUID().toString(), ""));

        // The same answer as for a work that doesn't exist, so it doesn't reveal that the ID is real
        assertFieldError(usingTheirs, "workId", "unknown_work");
        assertThat(usingTheirs.body()).isEqualTo(usingMissing.body());

        String mine = addEdition(intruder, edition(workId(intruder), ""));
        assertFieldError(intruder.put(mine, edition(theirs, ""), "\"0\""), "workId", "unknown_work");
        assertThat(editionsOf(owner)).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM editions WHERE work_id = :work")
                        .param("work", UUID.fromString(theirs))
                        .query(Long.class)
                        .single())
                .isZero();
    }

    // ---- Rules for what's typed --------------------------------------------------------------------------------

    @Test
    void readingDatesAreChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        String future = LocalDate.now(ZoneOffset.UTC).plusDays(3).toString();

        assertFieldError(reader.post(EDITIONS, edition(work, ",\"finishedOn\":\"2026-01-01\"")), "startedOn", "start_required");
        assertFieldError(
                reader.post(EDITIONS, edition(work, ",\"startedOn\":\"2026-02-01\",\"finishedOn\":\"2026-01-01\"")),
                "finishedOn",
                "before_start");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"purchasedOn\":\"" + future + "\"")), "purchasedOn", "in_the_future");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"startedOn\":\"" + future + "\"")), "startedOn", "in_the_future");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"purchasedOn\":\"1899-12-31\"")), "purchasedOn", "invalid_date");
        assertThat(reader.post(EDITIONS, edition(work, ",\"purchasedOn\":\"2024-02-30\"")).statusCode())
                .as("not a real date")
                .isEqualTo(400);

        // Today is allowed (and tomorrow, for time zones ahead of UTC); one day is enough to read a short book
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        HttpResponse<String> sameDay = reader.post(EDITIONS,
                edition(work, ",\"purchasedOn\":\"%s\",\"startedOn\":\"%s\",\"finishedOn\":\"%s\"".formatted(today, today, today)));
        assertThat(sameDay.statusCode()).as(sameDay.body()).isEqualTo(201);
        assertThat(sameDay.body()).contains("\"status\":\"finished\"");

        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id, finished_on) VALUES (:id, :owner, :work, DATE '2026-01-01')""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .param("work", UUID.fromString(work))
                        .update())
                .as("finished but never started")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void pricesAreChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);

        assertFieldError(reader.post(EDITIONS, edition(work, ",\"price\":{\"amount\":\"10\"}")), "price.currency", "currency_required");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"price\":{\"currency\":\"GBP\"}")), "price.amount", "amount_required");
        assertFieldError(reader.post(EDITIONS, edition(work, price("95.555", "GBP"))), "price.amount", "invalid_amount");
        assertFieldError(reader.post(EDITIONS, edition(work, price("-1", "GBP"))), "price.amount", "invalid_amount");
        assertFieldError(reader.post(EDITIONS, edition(work, price("1500.5", "JPY"))), "price.amount", "invalid_amount");
        assertFieldError(reader.post(EDITIONS, edition(work, price("10", "POUNDS"))), "price.currency", "invalid_currency");
        assertFieldError(reader.post(EDITIONS, edition(work, price("10", "ABC"))), "price.currency", "invalid_currency");

        assertThat(reader.post(EDITIONS, edition(work, price("1.25", "KWD"))).body())
                .containsPattern("\"amount\":\"1.250\"");
        assertThat(reader.post(EDITIONS, edition(work, ",\"price\":{\"amount\":45,\"currency\":\"SAR\"}")).body())
                .as("a number works as well as text")
                .containsPattern("\"amount\":\"45.00\"");
        assertThat(reader.post(EDITIONS, edition(work, ",\"price\":{\"amount\":null,\"currency\":\"\"}")).body())
                .as("an empty price is no price")
                .contains("\"price\":null");

        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id, price_minor) VALUES (:id, :owner, :work, 100)""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .param("work", UUID.fromString(work))
                        .update())
                .as("an amount with no currency")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void isbnsAndDepositNumbersAreCheckedAndStoredInStandardDigits() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);

        assertFieldError(reader.post(EDITIONS, edition(work, ",\"isbn\":\"978-0-306-40615-6\"")), "isbn", "invalid_isbn");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"legalDeposit\":\"no. 12\"")), "legalDeposit", "invalid_legal_deposit");
        assertThat(reader.post(EDITIONS, edition(work, ",\"isbn\":\"ISBN 0-8044-2957-x\",\"legalDeposit\":\"۱۴۰۰/۵\""))
                        .body())
                .contains("\"isbn\":\"080442957X\"", "\"legalDeposit\":\"1400/5\"");

        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id, isbn) VALUES (:id, :owner, :work, '978-0-306')""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .param("work", UUID.fromString(work))
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void otherFieldsAreChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);

        assertFieldError(reader.post(EDITIONS, edition(work, ",\"language\":\"xx\"")), "language", "invalid_language");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"language\":\"Arabic\"")), "language", "invalid_language");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"volumes\":0")), "volumes", "invalid_number");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"volumes\":501")), "volumes", "invalid_number");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"editionNumber\":1000")), "editionNumber", "invalid_number");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"published\":{\"hijri\":0}")), "published.hijri", "invalid_year");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"published\":{\"ce\":2101}")), "published.ce", "invalid_year");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"title\":\"" + "a".repeat(501) + "\"")), "title", "too_long");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"muhaqqiq\":\"" + "ب".repeat(301) + "\"")), "muhaqqiq", "too_long");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"shelf\":\"top\\nshelf\"")), "shelf", "invalid_characters");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"publisher\":\"Dar\\u202E\"")), "publisher", "invalid_characters");
        assertFieldError(reader.post(EDITIONS, edition(work, ",\"notes\":\"" + "a".repeat(10_001) + "\"")), "notes", "too_long");

        HttpResponse<String> both = reader.post(EDITIONS, edition(work, ",\"published\":{\"hijri\":1424,\"ce\":2003}"));
        assertThat(both.body()).containsPattern("\"published\":\\{[^}]*\"ce\":2003");
    }

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String work = workId(laptop);
        String path = addEdition(laptop, edition(work, ""));

        assertThat(laptop.put(path, edition(work, ",\"shelf\":\"Study\""), "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, edition(work, ",\"shelf\":\"Edited on the phone\""), "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("\"shelf\":\"Study\"").doesNotContain("Edited on the phone");
        HttpResponse<String> noVersion = phone.put(path, edition(work, ""), null);
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(noVersion.body()).contains("\"code\":\"version_required\"");
    }

    // ---- Lists -------------------------------------------------------------------------------------------------

    @Test
    void listsOnlyShowYourOwnEditions() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String mughni = idFrom(created(reader.post(WORKS, "{\"titleAr\":\"المغني\",\"titleEn\":\"al-Mughni\"}")));
        String umdah = idFrom(created(reader.post(WORKS, "{\"titleAr\":\"عمدة الفقه\",\"titleEn\":\"Umdat al-Fiqh\"}")));
        addEdition(reader, edition(mughni, ",\"volumes\":15"));
        addEdition(reader, edition(umdah, ",\"title\":\"Bulugh, bound with Umdah\""));
        addEdition(reader, edition(mughni, ",\"volumes\":9,\"startedOn\":\"2026-01-01\""));
        addEdition(other, edition(workId(other), ",\"title\":\"Not yours\""));

        String english = reader.get(EDITIONS + "?sort=en").body();
        assertThat(english).contains("\"total\":3").doesNotContain("Not yours");
        // The cover title when there is one, otherwise the work's title; a leading "al-" is ignored
        assertThat(english.indexOf("Bulugh, bound with Umdah")).isLessThan(english.indexOf("al-Mughni"));
        assertThat(english).contains("\"status\":\"reading\"", "\"status\":\"not_started\"");

        String newest = reader.get(EDITIONS + "?sort=added").body();
        assertThat(newest.indexOf("\"volumes\":9")).as("newest first").isLessThan(newest.indexOf("\"volumes\":15"));

        assertThat(reader.get(EDITIONS + "?workId=" + mughni).body()).contains("\"total\":2").doesNotContain("Bulugh");
        assertThat(other.get(EDITIONS + "?workId=" + mughni).body()).contains("\"total\":0");

        String secondPage = reader.get(EDITIONS + "?sort=en&size=1&page=1").body();
        assertThat(secondPage).contains("\"page\":1", "\"size\":1", "\"total\":3");
    }

    @Test
    void listParametersAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.get(EDITIONS + "?size=500").body()).contains("\"size\":100");
        assertThat(reader.get(EDITIONS + "?size=0").body()).contains("\"size\":1");
        assertFieldError(reader.get(EDITIONS + "?page=-1"), "page", "invalid");
        assertFieldError(reader.get(EDITIONS + "?sort=price"), "sort", "invalid");
        assertFieldError(reader.get(EDITIONS + "?sort=ADDED"), "sort", "invalid");
        assertFieldError(reader.get(EDITIONS + "?workId=mughni"), "workId", "invalid");
    }

    @Test
    void deletingAWorkDeletesItsEditions() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        String path = addEdition(reader, edition(work, ""));
        addEdition(reader, edition(work, ""));

        assertThat(reader.delete(WORKS + "/" + work).statusCode()).isEqualTo(204);

        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(editionsOf(reader)).isZero();
    }

    // ---- The default currency ----------------------------------------------------------------------------------

    @Test
    void eachAccountKeepsItsOwnDefaultCurrency() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();

        assertThat(reader.get(SETTINGS).body()).contains("\"defaultCurrency\":null");
        HttpResponse<String> saved = reader.put(SETTINGS, "{\"defaultCurrency\":\" gbp \"}", null);
        assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
        assertThat(saved.body()).contains("\"defaultCurrency\":\"GBP\"");
        assertThat(reader.put(SETTINGS, "{\"defaultCurrency\":\"SAR\"}", null).body()).contains("\"SAR\"");
        assertThat(reader.get(SETTINGS).body()).contains("\"defaultCurrency\":\"SAR\"");
        assertThat(other.get(SETTINGS).body()).contains("\"defaultCurrency\":null");

        assertFieldError(reader.put(SETTINGS, "{\"defaultCurrency\":\"POUNDS\"}", null), "defaultCurrency", "invalid_currency");
        assertThat(reader.put(SETTINGS, "{\"defaultCurrency\":null}", null).body()).contains("\"defaultCurrency\":null");
        assertThat(reader.put(SETTINGS, "{\"ownerId\":\"" + other.accountId() + "\",\"defaultCurrency\":\"EUR\"}", null)
                        .statusCode())
                .isIn(200, 400);
        assertThat(other.get(SETTINGS).body()).as("never someone else's").contains("\"defaultCurrency\":null");
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        fill(reader, work, EditionService.MAX_EDITIONS_PER_ACCOUNT - 1);

        assertThat(reader.post(EDITIONS, edition(work, "")).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(EDITIONS, edition(work, ""));

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(editionsOf(reader)).isEqualTo(EditionService.MAX_EDITIONS_PER_ACCOUNT);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimit() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        fill(reader, work, EditionService.MAX_EDITIONS_PER_ACCOUNT - 2);
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (ApiBrowser device : devices) {
                answers.add(pool.submit(() -> device.post(EDITIONS, edition(work, ""))));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(4);
        assertThat(editionsOf(reader)).isEqualTo(EditionService.MAX_EDITIONS_PER_ACCOUNT);
    }

    @Test
    void oversizedBodiesAreRefused() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> response =
                reader.post(EDITIONS, edition(workId(reader), ",\"notes\":\"" + "a".repeat(70_000) + "\""));

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(editionsOf(reader)).isZero();
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        String marker = "PrivateNote";

        List<HttpResponse<String>> responses = List.of(
                reader.post(EDITIONS, edition(work, ",\"shelf\":\"" + marker + "\\u202E\"")),
                reader.post(EDITIONS, edition(work, ",\"isbn\":\"" + marker + "\"")),
                reader.post(EDITIONS, edition(work, ",\"legalDeposit\":\"" + marker + "\"")),
                reader.post(EDITIONS, edition(work, ",\"language\":\"" + marker + "\"")),
                reader.post(EDITIONS, edition(work, ",\"purchasedOn\":\"" + marker + "\"")),
                reader.post(EDITIONS, edition(work, price(marker, "GBP"))),
                reader.post(EDITIONS, edition(work, price("1", marker))),
                reader.post(EDITIONS, "{\"work\":{\"titleEn\":\"" + marker.repeat(60) + "\"}}"),
                reader.put(SETTINGS, "{\"defaultCurrency\":\"" + marker + "\"}", null),
                reader.get(EDITIONS + "?sort=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    @Test
    void deletingTheAccountRemovesItsEditionsAndSettings() throws Exception {
        ApiBrowser reader = newAccount();
        addEdition(reader, edition(workId(reader), price("10", "GBP")));
        reader.put(SETTINGS, "{\"defaultCurrency\":\"GBP\"}", null);

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(editionsOf(reader)).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM library_settings WHERE owner_id = :owner")
                        .param("owner", reader.accountId())
                        .query(Long.class)
                        .single())
                .isZero();
    }

    // ---- "You already have this" (ADR 0010, slice L1) ---------------------------------------------------------

    @Test
    void youAlreadyHaveThisOnlyLooksAtYourOwnBooks() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String mine = idFrom(addEdition(reader, edition(workId(reader), ",\"isbn\":\"978-0-306-40615-7\"")));
        String theirs = idFrom(addEdition(other, edition(workId(other), ",\"isbn\":\"9780306406157\"")));

        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157"))).containsExactly(mine);
        assertThat(idsIn(other.get(BY_ISBN + "9780306406157"))).containsExactly(theirs);
        assertThat(idsIn(reader.get(BY_ISBN + "9780804429573"))).as("another book").isEmpty();
        assertThat(idsIn(newAccount().get(BY_ISBN + "9780306406157"))).as("a third account").isEmpty();
    }

    @Test
    void anIsbn10AndItsIsbn13AreFoundAsTheSameBook() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        String ten = idFrom(addEdition(reader, edition(work, ",\"isbn\":\"0-306-40615-2\"")));
        String thirteen = idFrom(addEdition(reader, edition(work, ",\"isbn\":\"9780306406157\"")));

        // Both copies, oldest first, whichever way the ISBN is typed or scanned
        for (String typed : new String[] {"9780306406157", "0306406152", "ISBN 978-0-306-40615-7", "ردمك ٩٧٨٠٣٠٦٤٠٦١٥٧"}) {
            assertThat(idsIn(reader.get(BY_ISBN + URLEncoder.encode(typed, StandardCharsets.UTF_8))))
                    .as(typed)
                    .containsExactly(ten, thirteen);
        }
        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157&excludeId=" + ten)))
                .as("the copy being edited is left out")
                .containsExactly(thirteen);
        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157&excludeId=" + UUID.randomUUID())))
                .as("an ID that isn't a copy of this book leaves out nothing")
                .containsExactly(ten, thirteen);
    }

    @Test
    void aBookInTheBinIsNotAlreadyYours() throws Exception {
        ApiBrowser reader = newAccount();
        String path = addEdition(reader, edition(workId(reader), ",\"isbn\":\"9780306406157\""));
        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157"))).hasSize(1);

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);

        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157"))).isEmpty();
    }

    @Test
    void youAlreadyHaveThisNamesNoMoreThanFiveCopies() throws Exception {
        ApiBrowser reader = newAccount();
        String work = workId(reader);
        for (int i = 0; i < 7; i++) {
            addEdition(reader, edition(work, ",\"isbn\":\"9780306406157\""));
        }

        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157"))).hasSize(5);
    }

    @Test
    void theIsbnCheckIsCheckedAndNeverEchoesWhatWasTyped() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivateNote";

        assertFieldError(reader.get(EDITIONS + "/by-isbn"), "isbn", "required");
        assertFieldError(reader.get(BY_ISBN), "isbn", "required");
        assertFieldError(reader.get(BY_ISBN + "%20%20"), "isbn", "required");
        assertFieldError(reader.get(BY_ISBN + "978-0-306-40615-6"), "isbn", "invalid_isbn");
        assertFieldError(reader.get(BY_ISBN + "9".repeat(41)), "isbn", "invalid_isbn");
        assertFieldError(reader.get(BY_ISBN + marker), "isbn", "invalid_isbn");
        assertFieldError(reader.get(BY_ISBN + "9780306406157&excludeId=" + marker), "excludeId", "invalid");
        for (HttpResponse<String> response : List.of(
                reader.get(BY_ISBN + marker),
                reader.get(BY_ISBN + "9780306406157&excludeId=" + marker),
                reader.get(BY_ISBN + "%3Cscript%3E" + marker + "%3C%2Fscript%3E"))) {
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    @Test
    void theIsbnCheckTakesNoOwnerOrOtherFieldsFromTheRequest() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        addEdition(other, edition(workId(other), ",\"isbn\":\"9780306406157\""));

        // Whatever else is sent, the answer is about the signed-in account's own shelf
        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157&ownerId=" + other.accountId()))).isEmpty();
        assertThat(idsIn(reader.get(BY_ISBN + "9780306406157&owner_id=" + other.accountId()))).isEmpty();
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    /** Adds a work and returns its ID. */
    private static String workId(ApiBrowser browser) throws Exception {
        return idFrom(created(browser.post(WORKS, "{\"titleEn\":\"A work\"}")));
    }

    /** Adds an edition and returns its address. */
    private static String addEdition(ApiBrowser browser, String json) throws Exception {
        return created(browser.post(EDITIONS, json));
    }

    /** An edition of the work; {@code more} is extra JSON fields, starting with a comma. */
    private static String edition(String workId, String more) {
        return "{\"workId\":\"" + workId + "\"" + more + "}";
    }

    private static String price(String amount, String currency) {
        return ",\"price\":{\"amount\":\"" + amount + "\",\"currency\":\"" + currency + "\"}";
    }

    /** Checks the answer is 201 and returns the new record's address. */
    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    /** The IDs of the editions in an answer from the ISBN check, in the order given. */
    private static List<String> idsIn(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<String> ids = new ArrayList<>();
        Matcher matcher = EDITION_ID.matcher(response.body());
        while (matcher.find()) {
            ids.add(matcher.group(1));
        }
        return ids;
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private void fill(ApiBrowser browser, String workId, int count) {
        jdbc.sql("""
                        INSERT INTO editions (id, owner_id, work_id)
                        SELECT gen_random_uuid(), :owner, :work FROM generate_series(1, :count)
                        """)
                .param("owner", browser.accountId())
                .param("work", UUID.fromString(workId))
                .param("count", count)
                .update();
    }

    private long editionsOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM editions WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private long worksOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM works WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
