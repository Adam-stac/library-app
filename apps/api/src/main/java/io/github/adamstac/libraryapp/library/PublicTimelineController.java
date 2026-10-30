package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.reference.ScholarWorks;
import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The general timeline on the landing page (ADR 0010, slice T3), for anyone: the catalogue's scholars with a known
 * year of death. Reference data only, the same for everyone, read-only; nothing about the visitor is read or kept.
 * Each client address may ask only so often ({@code PublicReadFilter}). The browser keeps the answer for an hour and
 * then asks again with its ETag, which costs a 304 when the snapshot hasn't changed.
 */
@RestController
class PublicTimelineController {

    static final Duration KEPT_FOR = Duration.ofHours(1);

    private final ScholarWorks scholars;

    PublicTimelineController(ScholarWorks scholars) {
        this.scholars = scholars;
    }

    @GetMapping("/api/v1/public/scholars")
    ResponseEntity<TimelineController.Scholars> scholars() {
        List<ScholarWorks.DatedScholar> dated = scholars.dated();
        // Changes only with a new snapshot. Private: the response may carry the CSRF cookie, which a shared cache
        // must never hand to someone else
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(KEPT_FOR).cachePrivate())
                .eTag("W/\"scholars-" + Integer.toHexString(dated.hashCode()) + "-" + dated.size() + "\"")
                .body(new TimelineController.Scholars(dated));
    }
}
