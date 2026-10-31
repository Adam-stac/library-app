package io.github.adamstac.libraryapp.pages;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.ServiceBusyException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.UpstreamException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Reading a book's cover or title page from a photo (ADR 0011): checks the photo, counts the reading against the
 * limits, has it read, checks every line like text a reader typed, and turns the lines into suggested fields. Nothing
 * is saved: the reader confirms the fields and saves the book as usual. The log says how a reading went, never what
 * was on the page.
 */
@Service
class PageReadingService {

    private static final Logger log = LoggerFactory.getLogger(PageReadingService.class);
    static final int MAX_LINES = 200;
    static final int MAX_LINE = 500;
    /** Readings waiting on Google at once; more are told to try again shortly */
    static final int AT_ONCE = 4;

    /** What the form needs to know before offering the button */
    record Status(boolean enabled, int leftToday, int leftThisMonth, boolean paused) {}

    /** What was read: the fields as the rules found them, and every line, for the reader to move if need be */
    record Reading(TitlePage.Fields fields, List<String> lines) {}

    private final PageReader reader;
    private final PageReadingCounter counter;
    private final Semaphore atOnce = new Semaphore(AT_ONCE);

    PageReadingService(PageReader reader, PageReadingCounter counter) {
        this.reader = reader;
        this.counter = counter;
    }

    Status status(UUID ownerId) {
        if (!reader.enabled()) {
            return new Status(false, 0, 0, false);
        }
        PageReadingCounter.Left left = counter.left(ownerId);
        return new Status(true, left.today(), left.thisMonth(), left.appPaused());
    }

    Reading read(UUID ownerId, byte[] image) {
        if (!reader.enabled()) {
            throw new NotFoundException(); // no key: the feature is off, as if it weren't there
        }
        byte[] checked = PageImage.checked(image);
        if (!atOnce.tryAcquire()) {
            throw new ServiceBusyException();
        }
        try {
            long id = counter.reserve(ownerId);
            List<TitlePage.Line> read;
            try {
                read = reader.read(checked);
            } catch (UpstreamException e) {
                counter.finish(id, e.code());
                log.info("Page reading: {}", e.code());
                throw e;
            }
            List<TitlePage.Line> lines = clean(read);
            String outcome = lines.isEmpty() ? "nothing_read" : "read";
            counter.finish(id, outcome);
            log.info("Page reading: {}, {} lines", outcome, lines.size());
            return new Reading(TitlePage.read(lines), lines.stream().map(TitlePage.Line::text).toList());
        } finally {
            atOnce.release();
        }
    }

    /** Every line checked like text a reader typed; a line that fails is dropped and the rest are kept */
    static List<TitlePage.Line> clean(List<TitlePage.Line> lines) {
        List<TitlePage.Line> kept = new ArrayList<>();
        for (TitlePage.Line line : lines) {
            if (kept.size() >= MAX_LINES) {
                break;
            }
            try {
                String text = TextInput.line("line", line.text(), MAX_LINE);
                if (text != null) {
                    kept.add(new TitlePage.Line(text, Math.max(0, line.height()), Math.max(0, line.top())));
                }
            } catch (FieldValidationException dropped) {
                // A control or direction-override character, or far too long: not shown, not used
            }
        }
        return kept;
    }
}
