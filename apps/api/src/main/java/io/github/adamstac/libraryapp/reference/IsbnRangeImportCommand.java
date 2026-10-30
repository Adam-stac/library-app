package io.github.adamstac.libraryapp.reference;

import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

/**
 * The administrator's import of the ISBN ranges (docs/operations/isbn-ranges.md). It exists only when the app is
 * started with {@code --import.isbn-ranges.file}: it loads the file, says what it loaded or why it refused, and stops
 * the app with exit code 0 or 1. A normal start never has this property, so this never runs on the server.
 */
@Component
@ConditionalOnProperty("import.isbn-ranges.file")
class IsbnRangeImportCommand implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IsbnRangeImportCommand.class);

    private final IsbnRangeImporter importer;
    private final ApplicationContext context;
    private final String file;
    private final String sha256;

    IsbnRangeImportCommand(
            IsbnRangeImporter importer,
            ApplicationContext context,
            @Value("${import.isbn-ranges.file}") String file,
            @Value("${import.isbn-ranges.sha256:}") String sha256) {
        this.importer = importer;
        this.context = context;
        this.file = file;
        this.sha256 = sha256;
    }

    @Override
    public void run(ApplicationArguments args) {
        int code;
        try {
            IsbnRangeImporter.Report report = importer.load(Path.of(file), sha256);
            log.info("ISBN ranges imported: release {} of {}, SHA-256 {}, {} groups, {} rules",
                    report.serial(), report.messageDate(), report.sha256(), report.groups(), report.rules());
            code = 0;
        } catch (IsbnRangeImporter.Refused refused) {
            log.error("ISBN ranges not imported, nothing was changed: {}", refused.getMessage());
            code = 1;
        }
        int exitCode = code;
        System.exit(SpringApplication.exit(context, () -> exitCode));
    }
}
