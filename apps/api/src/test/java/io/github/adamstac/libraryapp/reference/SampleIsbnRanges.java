package io.github.adamstac.libraryapp.reference;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Loads the made-up sample ranges ({@code isbn/sample-ranges.xml}) through the real import, for tests in any module.
 * It has these groups and publisher codes:
 *
 * <ul>
 *   <li>978-0: two-digit codes below 2, three-digit codes from 2 to 6 (so 978-0-306), four-digit codes above</li>
 *   <li>978-9933 (Syria): three-digit codes from 6 to 8 (so 978-9933-685 and 978-9933-686)</li>
 *   <li>978-9953 (Lebanon): one-digit codes below 5; the rest isn't in use</li>
 *   <li>979-10 (France): five-digit codes from 9 (so 979-10-90636 and 979-10-90637)</li>
 * </ul>
 */
public final class SampleIsbnRanges {

    public static final Path FILE = file();

    private SampleIsbnRanges() {}

    /** Replaces whatever ranges are loaded with the sample. */
    public static void load(ApplicationContext context) {
        try {
            byte[] bytes = Files.readAllBytes(FILE);
            context.getBean(IsbnRangeImporter.class).load(FILE, IsbnRangeImporter.sha256(bytes));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Empties the ranges, as on a server where the import hasn't been run. */
    public static void clear(ApplicationContext context) {
        JdbcClient jdbc = context.getBean(JdbcClient.class);
        jdbc.sql("DELETE FROM isbn_ranges").update();
        jdbc.sql("DELETE FROM isbn_range_release").update();
    }

    private static Path file() {
        try {
            return Path.of(Objects.requireNonNull(SampleIsbnRanges.class.getResource("/isbn/sample-ranges.xml")).toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }
}
