package io.github.adamstac.libraryapp.authors;

import static io.github.adamstac.libraryapp.authors.AuthorTests.AUTHORS;
import static io.github.adamstac.libraryapp.authors.AuthorTests.idOf;
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

/** An author's birth and death places: the shared list or the user's own places, never anyone else's. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class AuthorPlaceTests {

    static final String PLACES = "/api/v1/places";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void anAuthorCanHaveABirthplaceAndADeathPlace() throws Exception {
        ApiBrowser reader = newAccount();
        String bukhara = sharedPlace("Bukhara");
        String khartank = addPlace(reader, "{\"nameAr\":\"خرتنك\",\"nameEn\":\"Khartank\"}");

        HttpResponse<String> created = reader.post(AUTHORS, """
                {"nameEn":"al-Bukhari","birthPlaceId":"%s","deathPlaceId":"%s"}""".formatted(bukhara, khartank));

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String path = created.headers().firstValue("Location").orElseThrow(); // the body also holds the places' IDs
        assertThat(reader.get(path).body())
                .contains("\"birthPlace\":{\"id\":\"" + bukhara + "\",\"nameAr\":\"بخارى\",\"nameEn\":\"Bukhara\"}")
                .contains("\"deathPlace\":{\"id\":\"" + khartank + "\",\"nameAr\":\"خرتنك\",\"nameEn\":\"Khartank\"}");

        // An edit that leaves the places out clears them, like any other field
        HttpResponse<String> edited = reader.put(path, "{\"nameEn\":\"al-Bukhari\",\"deathPlaceId\":null}", "\"0\"");
        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        assertThat(edited.body()).contains("\"birthPlace\":null", "\"deathPlace\":null");
    }

    @Test
    void cantUseAnotherUsersPlace() throws Exception {
        ApiBrowser owner = newAccount();
        ApiBrowser intruder = newAccount();
        String theirs = addPlace(owner, "{\"nameEn\":\"Private village\"}");
        String missing = UUID.randomUUID().toString();
        String mine = idOf(intruder.post(AUTHORS, "{\"nameEn\":\"Mine\"}").body());

        HttpResponse<String> usingTheirs = intruder.post(AUTHORS, withBirthplace(theirs));
        HttpResponse<String> usingMissing = intruder.post(AUTHORS, withBirthplace(missing));

        // The same answer as for a place that doesn't exist, so it doesn't reveal that the ID is real
        assertFieldError(usingTheirs, "birthPlaceId", "unknown_place");
        assertThat(usingTheirs.body()).isEqualTo(usingMissing.body());
        assertFieldError(
                intruder.put(AUTHORS + "/" + mine, "{\"nameEn\":\"Mine\",\"deathPlaceId\":\"" + theirs + "\"}", "\"0\""),
                "deathPlaceId",
                "unknown_place");

        assertThat(jdbc.sql("""
                        SELECT count(*) FROM authors
                        WHERE owner_id = :owner AND (birth_place_id IS NOT NULL OR death_place_id IS NOT NULL)""")
                        .param("owner", intruder.accountId())
                        .query(Long.class)
                        .single())
                .isZero();
        assertThat(intruder.get(AUTHORS + "/" + mine).body()).contains("\"version\":0");
    }

    @Test
    void aMalformedPlaceIdIsRefused() throws Exception {
        ApiBrowser reader = newAccount();

        for (String id : new String[] {"\"Makkah\"", "\"12345\"", "42", "{}", "[\"" + sharedPlace("Makkah") + "\"]"}) {
            HttpResponse<String> response = reader.post(AUTHORS, "{\"nameEn\":\"x\",\"birthPlaceId\":" + id + "}");
            assertThat(response.statusCode()).as(id).isEqualTo(400);
            assertThat(response.body()).doesNotContain("Makkah").doesNotContainIgnoringCase("exception");
        }
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

    private static String addPlace(ApiBrowser browser, String json) throws Exception {
        HttpResponse<String> response = browser.post(PLACES, json);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return idOf(response.body());
    }

    private static String withBirthplace(String placeId) {
        return "{\"nameEn\":\"Someone\",\"birthPlaceId\":\"" + placeId + "\"}";
    }

    private static void assertFieldError(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).contains("\"field\":\"" + field + "\"", "\"code\":\"" + code + "\"");
    }
}
