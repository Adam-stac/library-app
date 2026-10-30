package io.github.adamstac.libraryapp.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.RestController;

/**
 * The administrator's import of the ISBN Agency's ranges (ADR 0010, point 4), with a real Postgres. Every test starts
 * from the made-up sample, so a refused file can be shown to have changed nothing. Threat model: book-lookup.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class IsbnRangeImportTests {

    @Autowired
    private ApplicationContext context;

    @Autowired
    private IsbnRangeImporter importer;

    @Autowired
    private IsbnRanges ranges;

    @Autowired
    private JdbcClient jdbc;

    @TempDir
    private Path folder;

    @BeforeEach
    void startFromTheSample() {
        SampleIsbnRanges.load(context);
    }

    // ---- A good file ---------------------------------------------------------------------------------------------

    @Test
    void aGoodFileIsLoadedAndReplacesTheLastOne() throws Exception {
        String sample = Files.readString(SampleIsbnRanges.FILE);
        Path next = write("next.xml", sample.replace("test-sample-1", "test-sample-2"));

        IsbnRangeImporter.Report report = importer.load(next, sha256(next));

        assertThat(report.serial()).isEqualTo("test-sample-2");
        assertThat(report.groups()).isEqualTo(4);
        assertThat(report.rules()).isEqualTo(17);
        assertThat(count("isbn_ranges")).isEqualTo(17); // replaced, not added to
        assertThat(jdbc.sql("SELECT serial FROM isbn_range_release").query(String.class).list())
                .containsExactly("test-sample-2");
    }

    @Test
    void theRangesSplitAnIsbnAtItsPublishersCode() {
        assertThat(ranges.publisherPrefix("9789933685010")).contains("9789933685");
        assertThat(ranges.publisherPrefix("9789933686017")).contains("9789933686");
        assertThat(ranges.publisherPrefix("9780306400018")).contains("9780306");
        assertThat(ranges.publisherPrefix("9791090636019")).contains("9791090636");
        assertThat(ranges.publisherPrefix("9789953000015")).contains("97899530");
    }

    @Test
    void anIsbnOutsideTheGivenRangesHasNoPublisherCode() {
        assertThat(ranges.publisherPrefix("9789953600000")).isEmpty(); // a range not in use
        assertThat(ranges.publisherPrefix("9791300000005")).isEmpty(); // a group not given out
        assertThat(ranges.publisherPrefix("9789960000008")).isEmpty(); // a group not in the file
        assertThat(ranges.publisherPrefix("not an isbn")).isEmpty();
        assertThat(ranges.publisherPrefix(null)).isEmpty();

        SampleIsbnRanges.clear(context);
        assertThat(ranges.publisherPrefix("9789933685010")).isEmpty(); // nothing imported yet
    }

    // ---- Refused files change nothing ----------------------------------------------------------------------------

    @Test
    void anImportWithTheWrongChecksumIsRefused() throws Exception {
        Path changed = write("changed.xml", Files.readString(SampleIsbnRanges.FILE).replace("<Length>3</Length>", "<Length>2</Length>"));

        assertRefused(changed, sha256(SampleIsbnRanges.FILE), "SHA-256");
        assertRefused(changed, "not a checksum", "64 hexadecimal");
        assertRefused(changed, null, "64 hexadecimal");
    }

    @Test
    void xmlEntitiesAreNeverExpanded() throws Exception {
        assertRefused(write("bomb.xml", """
                <?xml version="1.0"?>
                <!DOCTYPE ISBNRangeMessage [
                <!ENTITY a "aaaaaaaaaaaaaaaaaaaa">
                <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
                <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
                ]>
                <ISBNRangeMessage><MessageDate>&c;</MessageDate></ISBNRangeMessage>
                """), "entity");
        assertRefused(write("file.xml", """
                <?xml version="1.0"?>
                <!DOCTYPE ISBNRangeMessage [ <!ENTITY secret SYSTEM "file:///etc/passwd"> ]>
                <ISBNRangeMessage><MessageDate>&secret;</MessageDate></ISBNRangeMessage>
                """), "entity");
        assertRefused(write("parameter.xml", """
                <?xml version="1.0"?>
                <!DOCTYPE ISBNRangeMessage [ <!ENTITY % remote SYSTEM "http://127.0.0.1:9/x.dtd"> %remote; ]>
                <ISBNRangeMessage/>
                """), "entity");
        assertRefused(write("outside.xml", """
                <?xml version="1.0"?>
                <!DOCTYPE ISBNRangeMessage SYSTEM "http://127.0.0.1:9/RangeMessage.dtd">
                <ISBNRangeMessage/>
                """), "outside file");
        assertRefused(write("two.xml", """
                <?xml version="1.0"?>
                <!DOCTYPE ISBNRangeMessage [ <!ELEMENT ISBNRangeMessage ANY> ]>
                <!DOCTYPE other [ <!ELEMENT other ANY> ]>
                <ISBNRangeMessage/>
                """), "more than one DTD");
    }

    @Test
    void importedTextIsCheckedLikeReaderText() throws Exception {
        String sample = Files.readString(SampleIsbnRanges.FILE);
        Map<String, String> broken = Map.of(
                "a direction mark in the date", sample.replace("Fri, 30 Oct", "Fri,‮ 30 Oct"),
                "a length over 7", sample.replace("<Length>4</Length>", "<Length>8</Length>"),
                "a range that isn't seven digits", sample.replace("0000000-1999999", "000000-1999999"),
                "a range that runs backwards", sample.replace("2000000-6999999", "6999999-2000000"),
                "overlapping ranges", sample.replace("9000000-9999999</Range><Length>4", "8000000-9999999</Range><Length>4"),
                "a group listed twice", sample.replace("<Prefix>978-9953</Prefix>", "<Prefix>978-9933</Prefix>"),
                "a prefix that isn't 978 or 979", sample.replace("<Prefix>979-10</Prefix>", "<Prefix>977-10</Prefix>"),
                "a publisher's code too long to leave room for the title", sample.replace(
                        "<Range>9000000-9999999</Range><Length>5</Length>", "<Range>9000000-9999999</Range><Length>7</Length>"),
                "something else entirely", "<html><body>Not found</body></html>",
                "not XML at all", "\u0000\u0001 not xml");
        for (Map.Entry<String, String> file : broken.entrySet()) {
            Path path = write("broken.xml", file.getValue());
            assertThatThrownBy(() -> importer.load(path, sha256(path)))
                    .as(file.getKey())
                    .isInstanceOf(IsbnRangeImporter.Refused.class);
            assertTheSampleIsStillLoaded();
        }
    }

    @Test
    void aFileThatIsTooLargeOrMissingIsRefused() throws Exception {
        Path large = folder.resolve("large.xml");
        Files.write(large, new byte[(int) IsbnRangeImporter.MAX_BYTES + 1]);
        assertRefused(large, sha256(large), "larger than");
        assertRefused(folder.resolve("missing.xml"), "0".repeat(64), "no file");
    }

    // ---- Nothing else writes reference data ------------------------------------------------------------------------

    @Test
    void noEndpointWritesReferenceData() {
        List<String> controllers = context.getBeansWithAnnotation(RestController.class).values().stream()
                .map(bean -> bean.getClass().getPackageName())
                .filter(name -> name.startsWith(IsbnRanges.class.getPackageName()))
                .toList();
        assertThat(controllers).isEmpty();
        // The import command only exists when the app is started with the import's own property
        assertThat(context.getBeanNamesForType(IsbnRangeImportCommand.class)).isEmpty();
    }

    // ---- Helpers -------------------------------------------------------------------------------------------------

    private void assertRefused(Path file, String sha256, String reason) {
        assertThatThrownBy(() -> importer.load(file, sha256))
                .isInstanceOf(IsbnRangeImporter.Refused.class)
                .hasMessageContaining(reason);
        assertTheSampleIsStillLoaded();
    }

    private void assertRefused(Path file, String reason) throws Exception {
        assertRefused(file, sha256(file), reason);
    }

    private void assertTheSampleIsStillLoaded() {
        assertThat(count("isbn_ranges")).isEqualTo(17);
        assertThat(jdbc.sql("SELECT serial FROM isbn_range_release").query(String.class).list())
                .containsExactly("test-sample-1");
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    private Path write(String name, String text) throws Exception {
        Path file = folder.resolve(name);
        Files.writeString(file, text, StandardCharsets.UTF_8);
        return file;
    }

    private static String sha256(Path file) throws Exception {
        return IsbnRangeImporter.sha256(Files.readAllBytes(file));
    }
}
