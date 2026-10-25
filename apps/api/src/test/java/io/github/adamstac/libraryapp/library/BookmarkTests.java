package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Bookmarks, over real HTTP with a real Postgres. Each test makes its own accounts. Threat model: library. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class BookmarkTests {

    static final String EDITIONS = "/api/v1/editions";
    static final String WORKS = "/api/v1/works";
    static final String BOOKMARKS = "/api/v1/bookmarks";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- Who may use it ----------------------------------------------------------------------------------------

    @Test
    void bookmarksNeedSignIn() throws Exception {
        ApiBrowser nobody = ApiBrowser.signedOut(port);
        String path = EDITIONS + "/" + UUID.randomUUID() + "/bookmark";

        assertThat(nobody.get(BOOKMARKS).statusCode()).isEqualTo(401);
        assertThat(nobody.get(path).statusCode()).isEqualTo(401);
        assertThat(nobody.put(path, "{\"page\":1}", null).statusCode()).isEqualTo(401);
        assertThat(nobody.delete(path).statusCode()).isEqualTo(401);
    }

    @Test
    void bookmarkChangesNeedTheCsrfToken() throws Exception {
        ApiBrowser reader = newAccount();
        String bookmark = bookmarkOf(addEdition(reader, 1));
        assertThat(reader.put(bookmark, "{\"page\":10}", null).statusCode()).isEqualTo(200);

        assertThat(reader.send("PUT", bookmark, "{\"page\":99}", null, false).statusCode()).isEqualTo(403);
        assertThat(reader.send("DELETE", bookmark, null, null, false).statusCode()).isEqualTo(403);

        assertThat(reader.get(bookmark).body()).contains("\"page\":10");
    }

    @Test
    void anotherUsersBookmarksAreInvisibleAndUnchangeable() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String theirs = bookmarkOf(addEdition(owner, 13));
        assertThat(owner.put(theirs, "{\"volume\":3,\"page\":214}", null).statusCode()).isEqualTo(200);
        String missing = EDITIONS + "/" + UUID.randomUUID() + "/bookmark";

        // Read, move and remove: the same 404 as for an edition that doesn't exist
        for (String method : new String[] {"GET", "PUT", "DELETE"}) {
            HttpResponse<String> onTheirs = call(intruder, method, theirs);
            HttpResponse<String> onMissing = call(intruder, method, missing);
            assertThat(onTheirs.statusCode()).as(method).isEqualTo(404);
            assertThat(onTheirs.body().replace(theirs, "PATH")).as(method)
                    .isEqualTo(onMissing.body().replace(missing, "PATH"));
        }

        assertThat(owner.get(theirs).body()).contains("\"volume\":3", "\"page\":214");
        assertThat(intruder.get(BOOKMARKS).body()).contains("\"total\":0");
    }

    // ---- Putting in, moving and removing -----------------------------------------------------------------------

    @Test
    void aBookmarkCanBePutInMovedAndRemoved() throws Exception {
        ApiBrowser reader = newAccount();
        String edition = addEdition(reader, 13);
        String bookmark = bookmarkOf(edition);

        assertThat(reader.get(bookmark).statusCode()).as("none yet").isEqualTo(404);
        assertThat(reader.get(edition).body()).contains("\"bookmark\":null");

        HttpResponse<String> placed = reader.put(bookmark, "{\"volume\":3,\"page\":214}", null);
        assertThat(placed.statusCode()).as(placed.body()).isEqualTo(200);
        assertThat(placed.body()).contains("\"volume\":3", "\"page\":214", "\"movedAt\":");
        assertThat(reader.get(edition).body()).containsPattern("\"bookmark\":\\{[^}]*\"page\":214");

        // Moving replaces it; still one per edition
        assertThat(reader.put(bookmark, "{\"volume\":4,\"page\":12}", null).body()).contains("\"volume\":4", "\"page\":12");
        assertThat(jdbc.sql("SELECT count(*) FROM bookmarks WHERE edition_id = :edition")
                        .param("edition", UUID.fromString(idFrom(edition)))
                        .query(Long.class)
                        .single())
                .isEqualTo(1);

        assertThat(reader.delete(bookmark).statusCode()).isEqualTo(204);
        assertThat(reader.get(bookmark).statusCode()).isEqualTo(404);
        assertThat(reader.delete(bookmark).statusCode()).as("removing it again is fine").isEqualTo(204);
        assertThat(reader.get(edition).body()).contains("\"bookmark\":null");
    }

    @Test
    void theNewestMoveWins() throws Exception {
        ApiBrowser laptop = newAccount();
        ApiBrowser phone = laptop.anotherDevice();
        String bookmark = bookmarkOf(addEdition(laptop, 1));

        assertThat(laptop.put(bookmark, "{\"page\":50}", null).statusCode()).isEqualTo(200);
        assertThat(phone.put(bookmark, "{\"page\":30}", null).statusCode()).as("no version needed").isEqualTo(200);

        assertThat(laptop.get(bookmark).body()).contains("\"page\":30");
    }

    @Test
    void theVolumeMustFitTheEdition() throws Exception {
        ApiBrowser reader = newAccount();
        String set = bookmarkOf(addEdition(reader, 13));
        String single = bookmarkOf(addEdition(reader, 1));
        String unknown = bookmarkOf(addEdition(reader, null));

        assertFieldError(reader.put(set, "{\"page\":5}", null), "volume", "volume_required");
        assertFieldError(reader.put(set, "{\"volume\":14,\"page\":5}", null), "volume", "invalid_number");
        assertFieldError(reader.put(set, "{\"volume\":0,\"page\":5}", null), "volume", "invalid_number");
        assertThat(reader.put(set, "{\"volume\":13,\"page\":5}", null).statusCode()).isEqualTo(200);

        // One volume needs no volume number; 1 is accepted and left out
        assertThat(reader.put(single, "{\"volume\":1,\"page\":5}", null).body()).contains("\"volume\":null");
        assertFieldError(reader.put(single, "{\"volume\":2,\"page\":5}", null), "volume", "invalid_number");

        // When the number of volumes isn't known, any volume up to the most an edition can have
        assertThat(reader.put(unknown, "{\"page\":5}", null).statusCode()).isEqualTo(200);
        assertThat(reader.put(unknown, "{\"volume\":40,\"page\":5}", null).statusCode()).isEqualTo(200);
        assertFieldError(reader.put(unknown, "{\"volume\":501,\"page\":5}", null), "volume", "invalid_number");
    }

    @Test
    void thePageIsChecked() throws Exception {
        ApiBrowser reader = newAccount();
        String bookmark = bookmarkOf(addEdition(reader, 1));

        assertFieldError(reader.put(bookmark, "{}", null), "page", "required");
        assertFieldError(reader.put(bookmark, "{\"page\":0}", null), "page", "invalid_number");
        assertFieldError(reader.put(bookmark, "{\"page\":100000}", null), "page", "invalid_number");
        assertThat(reader.put(bookmark, "{\"page\":99999}", null).statusCode()).isEqualTo(200);
        for (String malformed : new String[] {"", "{", "[]", "{\"page\":\"ten\"}", "{\"page\":1e30}", "{\"page\":[1]}",
            "{\"volume\":{},\"page\":1}"}) {
            HttpResponse<String> response = reader.put(bookmark, malformed, null);
            assertThat(response.statusCode()).as(malformed).isEqualTo(400);
            assertThat(response.body()).doesNotContainIgnoringCase("exception");
        }

        assertThatThrownBy(() -> jdbc.sql("UPDATE bookmarks SET page = 0 WHERE owner_id = :owner")
                        .param("owner", reader.accountId())
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anEditCantLeaveTheBookmarkInAVolumeThatIsGone() throws Exception {
        ApiBrowser reader = newAccount();
        String work = idFrom(created(reader.post(WORKS, "{\"titleEn\":\"Fath al-Bari\"}")));
        String edition = created(reader.post(EDITIONS, "{\"workId\":\"" + work + "\",\"volumes\":13}"));
        assertThat(reader.put(bookmarkOf(edition), "{\"volume\":5,\"page\":1}", null).statusCode()).isEqualTo(200);

        assertFieldError(
                reader.put(edition, "{\"workId\":\"" + work + "\",\"volumes\":3}", "\"0\""), "volumes", "below_bookmark");
        assertThat(reader.put(edition, "{\"workId\":\"" + work + "\",\"volumes\":5}", "\"0\"").statusCode()).isEqualTo(200);
        assertThat(reader.put(edition, "{\"workId\":\"" + work + "\"}", "\"1\"").statusCode())
                .as("an unknown number of volumes fits any bookmark")
                .isEqualTo(200);
    }

    // ---- The most recently moved -------------------------------------------------------------------------------

    @Test
    void theMostRecentlyMovedComeFirstAndOnlyYourOwn() throws Exception {
        ApiBrowser reader = newAccount();
        ApiBrowser other = newAccount();
        String first = addEdition(reader, 1);
        String second = addEdition(reader, 13);
        reader.put(bookmarkOf(first), "{\"page\":10}", null);
        reader.put(bookmarkOf(second), "{\"volume\":2,\"page\":20}", null);
        other.put(bookmarkOf(addEdition(other, 1)), "{\"page\":99}", null);
        reader.put(bookmarkOf(first), "{\"page\":11}", null);

        String recent = reader.get(BOOKMARKS).body();
        assertThat(recent).contains("\"total\":2", "\"titleEn\":\"A work\"").doesNotContain("\"page\":99");
        assertThat(recent.indexOf(idFrom(first))).as("moved last, so first").isLessThan(recent.indexOf(idFrom(second)));
        assertThat(reader.get(BOOKMARKS + "?size=1&page=1").body()).contains(idFrom(second), "\"size\":1");
        assertFieldError(reader.get(BOOKMARKS + "?page=-1"), "page", "invalid");
        assertThat(reader.get(BOOKMARKS + "?size=500").body()).contains("\"size\":100");
    }

    // ---- Deleting ----------------------------------------------------------------------------------------------

    @Test
    void deletingTheEditionOrTheAccountRemovesTheBookmark() throws Exception {
        ApiBrowser reader = newAccount();
        String gone = addEdition(reader, 1);
        reader.put(bookmarkOf(gone), "{\"page\":10}", null);
        reader.put(bookmarkOf(addEdition(reader, 1)), "{\"page\":20}", null);

        assertThat(reader.delete(gone).statusCode()).isEqualTo(204);
        assertThat(bookmarksOf(reader)).isEqualTo(1);

        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", reader.accountId()).update();
        assertThat(bookmarksOf(reader)).isZero();
    }

    @Test
    void errorsNeverEchoTheInput() throws Exception {
        ApiBrowser reader = newAccount();
        String bookmark = bookmarkOf(addEdition(reader, 13));
        String marker = "PrivatePage";

        List<HttpResponse<String>> responses = List.of(
                reader.put(bookmark, "{\"page\":\"" + marker + "\"}", null),
                reader.put(bookmark, "{\"volume\":\"" + marker + "\",\"page\":1}", null),
                reader.get(BOOKMARKS + "?size=" + marker));
        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(marker).doesNotContainIgnoringCase("exception");
        }
    }

    // ---- Helpers -----------------------------------------------------------------------------------------------

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }

    /** Adds an edition (of a new work) with this many volumes, or an unknown number, and returns its address. */
    private static String addEdition(ApiBrowser browser, Integer volumes) throws Exception {
        String work = idFrom(created(browser.post(WORKS, "{\"titleEn\":\"A work\"}")));
        return created(browser.post(EDITIONS, "{\"workId\":\"" + work + "\",\"volumes\":" + volumes + "}"));
    }

    private static String bookmarkOf(String editionPath) {
        return editionPath + "/bookmark";
    }

    private static HttpResponse<String> call(ApiBrowser browser, String method, String path) throws Exception {
        return switch (method) {
            case "GET" -> browser.get(path);
            case "PUT" -> browser.put(path, "{\"volume\":1,\"page\":1}", null);
            default -> browser.delete(path);
        };
    }

    private static String created(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return response.headers().firstValue("Location").orElseThrow();
    }

    private static String idFrom(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private long bookmarksOf(ApiBrowser browser) {
        return jdbc.sql("SELECT count(*) FROM bookmarks WHERE owner_id = :owner")
                .param("owner", browser.accountId())
                .query(Long.class)
                .single();
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
