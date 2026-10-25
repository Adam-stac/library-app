package io.github.adamstac.libraryapp.places;

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

/** Places, over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class PlaceTests {

    static final String PLACES = "/api/v1/places";
    static final String AUTHORS = "/api/v1/authors";
    static final Pattern ID = Pattern.compile("\"id\":\"([0-9a-f-]{36})\"");

    static final String VILLAGE = """
            {"nameAr":"قرية الشيخ","nameEn":"The shaykh's village","otherNames":["القرية","Old village"],
             "countryAr":"المغرب","countryEn":"Morocco","latitude":31.5,"longitude":-7.25}""";

    static final String EDIT = """
            {"nameAr":"قرية الشيخ الكبرى","nameEn":"The shaykh's great village"}""";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void placesNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = PLACES + "/" + sharedPlace("Makkah");

        assertThat(nobody.get(PLACES).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.post(PLACES, VILLAGE).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void placeChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String path = PLACES + "/" + add(reader, VILLAGE);

        assertThat(reader.send("POST", PLACES, VILLAGE, null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("PUT", path, EDIT, "\"0\"", false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", path, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(path).body()).contains("\"version\":0");
        assertThat(ownPlaces(reader)).isEqualTo(1);
    }

    @Test
    void anotherUsersPlacesAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String id = add(owner, VILLAGE);

        // Read, edit and delete by ID: the same 404 as for an ID that doesn't exist
        CrossUserAccess.assertInvisible(intruder, PLACES + "/" + id, EDIT);

        assertThat(intruder.get(PLACES + "?scope=mine").body()).contains("\"total\":0").doesNotContain(id);
        assertThat(intruder.get(PLACES + "?size=100&sort=en").body()).doesNotContain(id, "shaykh");
        HttpResponse<String> after = owner.get(PLACES + "/" + id);
        assertThat(after.statusCode()).isEqualTo(200);
        assertThat(after.body()).contains("\"nameAr\":\"قرية الشيخ\"", "\"version\":0");
    }

    @Test
    void sharedPlacesAreVisibleToEveryoneButCantBeChangedOrDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String path = PLACES + "/" + sharedPlace("Jerusalem");

        HttpResponse<String> read = reader.get(path);
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(read.body())
                .contains("\"nameAr\":\"القدس\"", "\"countryAr\":\"فلسطين\"", "\"countryEn\":\"Palestine\"")
                .contains("بيت المقدس", "\"shared\":true");
        String etag = read.headers().firstValue("ETag").orElseThrow();

        for (HttpResponse<String> change : List.of(reader.put(path, EDIT, etag), reader.delete(path))) {
            assertThat(change.statusCode()).as(change.body()).isEqualTo(403);
            assertThat(change.body()).contains("\"code\":\"read_only\"");
        }
        assertThat(newAccount().get(path).body()).contains("\"nameAr\":\"القدس\"", "\"version\":0");
        assertThat(jdbc.sql("SELECT count(*) FROM places WHERE owner_id IS NULL AND name_en = 'Jerusalem'")
                        .query(Long.class)
                        .single())
                .isEqualTo(1);
    }

    @Test
    void ownerIdAndVersionInTheBodyAreNeverUsed() throws Exception {
        ApiBrowser victim = newAccount();
        ApiBrowser attacker = newAccount();
        UUID chosenId = UUID.randomUUID();

        HttpResponse<String> response = attacker.post(PLACES, """
                {"id":"%s","ownerId":"%s","owner_id":null,"shared":true,"version":99,"nameEn":"Planted"}"""
                .formatted(chosenId, victim.accountId()));

        assertThat(response.statusCode()).as(response.body()).isIn(201, 400);
        if (response.statusCode() == 201) {
            assertThat(idOf(response.body())).isNotEqualTo(chosenId.toString());
            assertThat(response.body()).contains("\"version\":0", "\"shared\":false");
            assertThat(ownPlaces(attacker)).isEqualTo(1);
        }
        assertThat(ownPlaces(victim)).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM places WHERE owner_id IS NULL AND name_en = 'Planted'")
                        .query(Long.class)
                        .single())
                .as("nothing is added to the shared list")
                .isZero();
    }

    // ---- Adding, reading, editing and deleting -----------------------------------------------------------------

    @Test
    void aPlaceCanBeAddedViewedEditedAndDeleted() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> created = reader.post(PLACES, VILLAGE);

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String id = idOf(created.body());
        String path = PLACES + "/" + id;
        assertThat(created.headers().firstValue("Location")).hasValue(path);
        assertThat(created.headers().firstValue("ETag")).hasValue("\"0\"");

        HttpResponse<String> read = reader.get(path);
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(read.headers().firstValue("ETag")).hasValue("\"0\"");
        assertThat(read.body())
                .contains("\"nameAr\":\"قرية الشيخ\"", "\"nameEn\":\"The shaykh's village\"")
                .contains("\"otherNames\":[\"القرية\",\"Old village\"]", "\"countryEn\":\"Morocco\"")
                .contains("\"latitude\":31.5", "\"longitude\":-7.25", "\"shared\":false", "\"version\":0");

        HttpResponse<String> edited = reader.put(path, EDIT, "\"0\"");

        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(edited.body())
                .contains("\"nameAr\":\"قرية الشيخ الكبرى\"", "\"otherNames\":[]", "\"latitude\":null")
                .contains("\"version\":1")
                .as("fields left out of an edit are cleared")
                .doesNotContain("Morocco", "Old village");

        assertThat(reader.delete(path).statusCode()).isEqualTo(204);
        assertThat(reader.get(path).statusCode()).isEqualTo(404);
        assertThat(reader.delete(path).statusCode()).isEqualTo(404);
    }

    @Test
    void atLeastOneNameIsNeeded() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(PLACES, "{\"nameAr\":\" \",\"otherNames\":[\"Somewhere\"]}"), "nameAr", "name_required");
        assertThat(reader.post(PLACES, "{\"nameAr\":\"سجستان\"}").statusCode()).isEqualTo(201);
    }

    // ---- Rules for what's typed --------------------------------------------------------------------------------

    @Test
    void otherNamesAreCleanedAndLimited() throws Exception {
        ApiBrowser reader = newAccount();

        // Blank names are dropped; a name given twice (here once as alif + combining hamza) is kept once
        HttpResponse<String> created = reader.post(PLACES, """
                {"nameEn":"Ahsa","otherNames":["  الأحساء  ","","\\u0627\\u0654حساء",null,"أحساء","Hajar"]}""");
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(created.body()).contains("\"otherNames\":[\"الأحساء\",\"أحساء\",\"Hajar\"]");

        String ten = "[" + "\"a\",".repeat(9) + "\"b\"]";
        assertThat(reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":" + ten + "}").statusCode()).isEqualTo(201);
        String eleven = "[" + "\"a\",".repeat(10) + "\"b\"]";
        assertFieldError(reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":" + eleven + "}"), "otherNames", "too_many");
        assertFieldError(
                reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":[\"" + "ب".repeat(201) + "\"]}"),
                "otherNames",
                "too_long");
        assertFieldError(
                reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":[\"ok\",\"bad\\u202E\"]}"),
                "otherNames",
                "invalid_characters");
        assertThat(reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":\"one\"}").statusCode())
                .as("a single string, not a list")
                .isIn(201, 400);

        // The database refuses them too, if the API ever let them through
        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO places (id, owner_id, name_en, other_names)
                        VALUES (:id, :owner, 'x', array_fill('a'::text, ARRAY[11]))""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO places (id, owner_id, name_en, other_names) VALUES (:id, :owner, 'x', ARRAY[''])""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void coordinatesAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(PLACES, coordinates("21.4", "null")), "longitude", "coordinates_incomplete");
        assertFieldError(reader.post(PLACES, coordinates("null", "39.8")), "latitude", "coordinates_incomplete");
        assertFieldError(reader.post(PLACES, coordinates("90.1", "0")), "latitude", "invalid_coordinate");
        assertFieldError(reader.post(PLACES, coordinates("0", "-180.5")), "longitude", "invalid_coordinate");
        // Too big for a number (read as infinity, or refused while reading), and not a number at all
        assertThat(reader.post(PLACES, coordinates("1e400", "0")).statusCode()).isEqualTo(400);
        assertThat(reader.post(PLACES, coordinates("\"north\"", "0")).statusCode()).isEqualTo(400);

        // Kept to 5 decimal places (about a metre); the extremes are allowed
        HttpResponse<String> precise = reader.post(PLACES, coordinates("21.4225678", "-39.826206"));
        assertThat(precise.statusCode()).as(precise.body()).isEqualTo(201);
        assertThat(precise.body()).contains("\"latitude\":21.42257", "\"longitude\":-39.82621");
        assertThat(reader.post(PLACES, coordinates("-90", "180")).statusCode()).isEqualTo(201);
    }

    @Test
    void fieldLimitsAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();

        assertFieldError(reader.post(PLACES, "{\"nameEn\":\"" + "a".repeat(201) + "\"}"), "nameEn", "too_long");
        assertThat(reader.post(PLACES, "{\"nameAr\":\"" + "ب".repeat(200) + "\"}").statusCode()).isEqualTo(201);
        assertFieldError(
                reader.post(PLACES, "{\"nameEn\":\"x\",\"countryEn\":\"" + "a".repeat(101) + "\"}"),
                "countryEn",
                "too_long");
        assertFieldError(reader.post(PLACES, "{\"nameEn\":\"x\",\"countryAr\":\"a\\nb\"}"), "countryAr", "invalid_characters");
        assertFieldError(reader.post(PLACES, "{\"nameEn\":\"al-\\u202EQuds\"}"), "nameEn", "invalid_characters");

        assertThatThrownBy(() -> jdbc.sql("INSERT INTO places (id, owner_id) VALUES (:id, :owner)")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .as("a place with no name")
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("""
                        INSERT INTO places (id, owner_id, name_en, latitude) VALUES (:id, :owner, 'x', 10)""")
                        .param("id", UUID.randomUUID())
                        .param("owner", reader.accountId())
                        .update())
                .as("a latitude without a longitude")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- Edits from two devices --------------------------------------------------------------------------------

    @Test
    void aStaleVersionIsRefused() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String path = PLACES + "/" + add(laptop, VILLAGE);

        assertThat(laptop.put(path, EDIT, "\"0\"").statusCode()).isEqualTo(200);
        HttpResponse<String> stale = phone.put(path, "{\"nameEn\":\"Edited on the phone\"}", "\"0\"");

        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(stale.body()).contains("\"code\":\"stale_version\"");
        assertThat(laptop.get(path).body()).contains("قرية الشيخ الكبرى").doesNotContain("Edited on the phone");
        HttpResponse<String> noVersion = phone.put(path, "{\"nameEn\":\"Edited on the phone\"}", null);
        assertThat(noVersion.statusCode()).isEqualTo(400);
        assertThat(noVersion.body()).contains("\"code\":\"version_required\"");
    }

    // ---- Lists -------------------------------------------------------------------------------------------------

    @Test
    void listsShowTheSharedListAndYourOwnPlaces() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String village = add(reader, "{\"nameEn\":\"Aaa village\",\"countryEn\":\"Yemen\"}");
        add(reader, "{\"nameAr\":\"قرية\"}");
        add(other, "{\"nameEn\":\"Aab not yours\"}");
        long shared = sharedPlaces();

        String mine = reader.get(PLACES + "?scope=mine&sort=en").body();
        assertThat(mine).contains("\"total\":2", "Aaa village", "\"shared\":false").doesNotContain("Makkah");

        String sharedOnly = reader.get(PLACES + "?scope=shared&size=100").body();
        assertThat(sharedOnly).contains("\"total\":" + shared, "Makkah", "\"shared\":true")
                .doesNotContain("Aaa village", "\"shared\":false");

        String all = reader.get(PLACES + "?sort=en&size=100").body();
        assertThat(all).contains("\"total\":" + (shared + 2)).doesNotContain("not yours");
        assertThat(all.indexOf(village)).as("Aaa village comes first in English order").isLessThan(all.indexOf("Aleppo"));
        assertThat(all.indexOf("Aleppo")).isLessThan(all.indexOf("Baghdad"));
        assertThat(all).doesNotContain("otherNames", "latitude");

        String arabic = reader.get(PLACES + "?sort=ar&size=100").body();
        assertThat(arabic.indexOf("بغداد")).isLessThan(arabic.indexOf("دمشق"));
    }

    @Test
    void listParametersAreChecked() throws Exception {
        ApiBrowser reader = newAccount();

        assertThat(reader.get(PLACES + "?size=500").body()).contains("\"size\":100");
        assertThat(reader.get(PLACES + "?size=0").body()).contains("\"size\":1");
        assertFieldError(reader.get(PLACES + "?page=-1"), "page", "invalid");
        assertFieldError(reader.get(PLACES + "?sort=fr"), "sort", "invalid");
        assertFieldError(reader.get(PLACES + "?scope=everyone"), "scope", "invalid");
        assertFieldError(reader.get(PLACES + "?scope=MINE"), "scope", "invalid");
        assertFieldError(reader.get(PLACES + "?size=lots"), "size", "invalid");
    }

    // ---- Places that are in use --------------------------------------------------------------------------------

    @Test
    void aPlaceInUseCantBeDeleted() throws Exception {
        ApiBrowser reader = newAccount();
        String village = add(reader, VILLAGE);
        HttpResponse<String> scholar = reader.post(AUTHORS, """
                {"nameEn":"A local scholar","birthPlaceId":"%s","deathPlaceId":"%s"}""".formatted(village, village));
        created(scholar);
        created(reader.post(AUTHORS, "{\"nameEn\":\"His student\",\"deathPlaceId\":\"%s\"}".formatted(village)));

        HttpResponse<String> inUse = reader.delete(PLACES + "/" + village);

        assertThat(inUse.statusCode()).isEqualTo(409);
        assertThat(inUse.body()).contains("\"code\":\"in_use\"", "\"usedBy\":{\"authors\":2}")
                .doesNotContain("local scholar", "student");
        assertThat(reader.get(PLACES + "/" + village).statusCode()).isEqualTo(200);

        // Once nothing refers to it, it can go
        assertThat(reader.delete(scholar.headers().firstValue("Location").orElseThrow()).statusCode()).isEqualTo(204);
        String student = jdbc.sql("SELECT id::text FROM authors WHERE owner_id = :owner")
                .param("owner", reader.accountId())
                .query(String.class)
                .single();
        assertThat(reader.put(AUTHORS + "/" + student, "{\"nameEn\":\"His student\"}", "\"0\"").statusCode())
                .isEqualTo(200);
        assertThat(reader.delete(PLACES + "/" + village).statusCode()).isEqualTo(204);
    }

    // ---- Abuse -------------------------------------------------------------------------------------------------

    @Test
    void limitsPerAccountAreEnforced() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, PlaceService.MAX_PLACES_PER_ACCOUNT - 1);

        assertThat(reader.post(PLACES, VILLAGE).statusCode()).as("the last one that fits").isEqualTo(201);
        HttpResponse<String> full = reader.post(PLACES, VILLAGE);

        assertThat(full.statusCode()).isEqualTo(409);
        assertThat(full.body()).contains("\"code\":\"limit_reached\"");
        assertThat(ownPlaces(reader)).isEqualTo(PlaceService.MAX_PLACES_PER_ACCOUNT);
        assertThat(newAccount().post(PLACES, VILLAGE).statusCode()).as("other accounts aren't affected").isEqualTo(201);
    }

    @Test
    void addsAtTheSameTimeCantPassTheLimit() throws Exception {
        ApiBrowser reader = newAccount();
        fill(reader, PlaceService.MAX_PLACES_PER_ACCOUNT - 2);
        List<ApiBrowser> devices = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            devices.add(reader.anotherDevice());
        }

        List<Integer> statuses = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<HttpResponse<String>>> answers = new ArrayList<>();
            for (ApiBrowser device : devices) {
                answers.add(pool.submit(() -> device.post(PLACES, VILLAGE)));
            }
            for (Future<HttpResponse<String>> answer : answers) {
                statuses.add(answer.get().statusCode());
            }
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(2);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(4);
        assertThat(ownPlaces(reader)).isEqualTo(PlaceService.MAX_PLACES_PER_ACCOUNT);
    }

    @Test
    void oversizedBodiesAreRefused() throws Exception {
        ApiBrowser reader = newAccount();

        HttpResponse<String> response =
                reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":[\"" + "a".repeat(70_000) + "\"]}");

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(ownPlaces(reader)).isZero();
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String marker = "PrivatePlace";

        List<HttpResponse<String>> responses = List.of(
                reader.post(PLACES, "{\"nameEn\":\"" + marker + "\\u202E\"}"),
                reader.post(PLACES, "{\"nameEn\":\"" + marker.repeat(20) + "\"}"),
                reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":[\"" + marker.repeat(20) + "\"]}"),
                reader.post(PLACES, "{\"nameEn\":\"x\",\"latitude\":\"" + marker + "\",\"longitude\":1}"),
                reader.post(PLACES, "{\"nameEn\":\"x\",\"otherNames\":[{\"" + marker + "\":1}]}"),
                reader.get(PLACES + "?scope=" + marker));

        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }

        // A malformed ID in the address: the problem's "instance" is the address the client itself asked for
        // (RFC 9457), not stored data, so it is the only place the text may appear
        HttpResponse<String> badId = reader.get(PLACES + "/" + marker);
        assertThat(badId.statusCode()).isEqualTo(400);
        assertThat(badId.body()).contains("\"field\":\"id\"", "\"instance\":\"" + PLACES + "/" + marker + "\"");
        assertThat(badId.body().replace("\"instance\":\"" + PLACES + "/" + marker + "\"", ""))
                .doesNotContain(marker)
                .doesNotContainIgnoringCase("exception");
    }

    @Test
    void deletingTheAccountRemovesItsPlacesButNotTheSharedList() throws Exception {
        ApiBrowser reader = newAccount();
        String village = add(reader, VILLAGE);
        created(reader.post(AUTHORS, """
                {"nameEn":"A local scholar","birthPlaceId":"%s","deathPlaceId":"%s"}"""
                .formatted(village, sharedPlace("Damascus"))));
        long shared = sharedPlaces();

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();

        assertThat(ownPlaces(reader)).isZero();
        assertThat(sharedPlaces()).isEqualTo(shared);
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    private String sharedPlace(String englishName) {
        return jdbc.sql("SELECT id::text FROM places WHERE owner_id IS NULL AND name_en = :name")
                .param("name", englishName)
                .query(String.class)
                .single();
    }

    private static String add(ApiBrowser browser, String json) throws Exception {
        return idOf(created(browser.post(PLACES, json)));
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.body();
    }

    static String idOf(String body) {
        Matcher id = ID.matcher(body);
        assertThat(id.find()).as(body).isTrue();
        return id.group(1);
    }

    private void fill(ApiBrowser browser, int count) {
        jdbc.sql("""
                        INSERT INTO places (id, owner_id, name_en)
                        SELECT gen_random_uuid(), :owner, 'Place ' || n FROM generate_series(1, :count) AS n
                        """)
                .param("owner", browser.accountId())
                .param("count", count)
                .update();
    }

    private long ownPlaces(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM places WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private long sharedPlaces() {
        return jdbc.sql("SELECT count(*) FROM places WHERE owner_id IS NULL").query(Long.class).single();
    }

    private static String coordinates(String latitude, String longitude) {
        return "{\"nameEn\":\"Somewhere\",\"latitude\":" + latitude + ",\"longitude\":" + longitude + "}";
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
