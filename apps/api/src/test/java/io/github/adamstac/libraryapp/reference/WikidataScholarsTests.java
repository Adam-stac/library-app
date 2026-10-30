package io.github.adamstac.libraryapp.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The scholars snapshot from Wikidata (ADR 0010, point 4 as amended in L3), with a real Postgres: the one that ships
 * is loaded when the API starts, and a hostile or broken one can't do harm. Tests that load another snapshot put the
 * shipped one back afterwards. Threat model: book-lookup.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class WikidataScholarsTests {

    @Autowired
    private WikidataScholars scholars;

    @Autowired
    private JdbcClient jdbc;

    @AfterEach
    void putTheShippedSnapshotBack() {
        if (!WikidataScholars.SHA256.equals(loadedSha256())) {
            jdbc.sql("DELETE FROM reference_release").update();
            scholars.load(WikidataScholars.bundled());
        }
    }

    // ---- The snapshot that ships -----------------------------------------------------------------------------------

    @Test
    void theSnapshotThatShipsIsLoadedWhenTheApiStarts() {
        assertThat(loadedSha256()).isEqualTo(WikidataScholars.SHA256);
        assertThat(count("reference_scholars")).isGreaterThan(1000);
        assertThat(count("reference_works")).isGreaterThan(1000);
        // Every work has at least one author, and every author is a loaded scholar
        assertThat(jdbc.sql("SELECT count(*) FROM reference_works w WHERE NOT EXISTS"
                        + " (SELECT 1 FROM reference_work_authors wa WHERE wa.work_id = w.id)")
                .query(Long.class)
                .single())
                .isZero();
    }

    @Test
    void theShippedSnapshotMatchesTheChecksumPinnedInTheCode() {
        assertThat(IsbnRangeImporter.sha256(WikidataScholars.bundled())).isEqualTo(WikidataScholars.SHA256);
    }

    @Test
    void loadingTheSameSnapshotAgainChangesNothing() {
        assertThat(scholars.load(WikidataScholars.bundled()).changed()).isFalse();
    }

    // ---- A hostile or broken snapshot ------------------------------------------------------------------------------

    @Test
    void importedTextIsCheckedLikeReaderTextAndBadEntriesAreDropped() throws Exception {
        String longTitle = "ك".repeat(WikidataScholars.MAX_TITLE + 1);
        byte[] snapshot = gzip("""
                {"source":"test","licence":"CC0","retrieved":"2026-10-30","selection":"test",
                 "scholars":[
                   {"id":"Q1","ar":"البخاري","en":"al-Bukhari","deathCe":870,"deathHijri":256},
                   {"id":"Q2","ar":"‮مقلوب","en":null,"deathCe":null,"deathHijri":null},
                   {"id":"X3","ar":"ليس معرّفًا","en":null,"deathCe":null,"deathHijri":null},
                   {"id":"Q1","ar":"مكرر","en":null,"deathCe":null,"deathHijri":null},
                   {"id":"Q4","ar":"<script>alert(1)</script>","en":null,"deathCe":99999,"deathHijri":-5},
                   null],
                 "works":[
                   {"id":"Q10","ar":"صحيح البخاري","en":"Sahih al-Bukhari","authors":["Q1"]},
                   {"id":"Q11","ar":"%s","en":null,"authors":["Q1"]},
                   {"id":"Q12","ar":"بلا مؤلف معروف","en":null,"authors":["Q999"]},
                   {"id":"Q13","ar":"كتاب","en":null,"authors":["Q1","Q2","Q4"]},
                   {"id":"Q10","ar":"مكرر","en":null,"authors":["Q1"]},
                   null]}
                """.formatted(longTitle));

        WikidataScholars.Loaded loaded = scholars.load(snapshot);

        assertThat(loaded.changed()).isTrue();
        assertThat(loaded.scholars()).isEqualTo(2); // Q1, and Q4 kept as plain text with its impossible years dropped
        assertThat(loaded.works()).isEqualTo(2); // Q10 and Q13
        assertThat(loaded.dropped()).isEqualTo(8);
        assertThat(jdbc.sql("SELECT name_ar FROM reference_scholars WHERE id = 'Q4'").query(String.class).single())
                .isEqualTo("<script>alert(1)</script>");
        assertThat(jdbc.sql("SELECT count(*) FROM reference_scholars WHERE id = 'Q4' AND death_year_ce IS NULL"
                        + " AND death_year_hijri IS NULL")
                .query(Long.class)
                .single())
                .isOne();
        assertThat(jdbc.sql("SELECT scholar_id FROM reference_work_authors WHERE work_id = 'Q13' ORDER BY position")
                .query(String.class)
                .list())
                .containsExactly("Q1", "Q4"); // the dropped Q2 is left out
    }

    @Test
    void aBrokenSnapshotIsRefusedAndChangesNothing() throws Exception {
        long scholarsBefore = count("reference_scholars");
        List<byte[]> broken = List.of(
                "not gzip at all".getBytes(StandardCharsets.UTF_8),
                gzip("this isn't JSON"),
                gzip("{\"retrieved\":\"yesterday\",\"scholars\":[],\"works\":[]}"),
                gzip("[1, 2, 3]"),
                gzipBomb());
        for (byte[] snapshot : broken) {
            assertThatThrownBy(() -> scholars.load(snapshot)).isInstanceOf(WikidataScholars.Refused.class);
            assertThat(loadedSha256()).isEqualTo(WikidataScholars.SHA256);
            assertThat(count("reference_scholars")).isEqualTo(scholarsBefore);
        }
    }

    // ---- Helpers -------------------------------------------------------------------------------------------------

    private String loadedSha256() {
        return jdbc.sql("SELECT sha256 FROM reference_release WHERE source = 'wikidata-scholars'")
                .query(String.class)
                .optional()
                .orElse(null);
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    private static byte[] gzip(String text) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(text.getBytes(StandardCharsets.UTF_8));
        }
        return out.toByteArray();
    }

    /** A small file that unpacks to more than the limit allows. */
    private static byte[] gzipBomb() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            byte[] spaces = new byte[1024 * 1024];
            java.util.Arrays.fill(spaces, (byte) ' ');
            for (int i = 0; i <= WikidataScholars.MAX_UNPACKED_BYTES / spaces.length; i++) {
                gzip.write(spaces);
            }
        }
        return out.toByteArray();
    }
}
