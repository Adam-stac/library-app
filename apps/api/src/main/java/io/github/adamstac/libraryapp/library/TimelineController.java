package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.reference.ScholarWorks;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in user's authors timeline (SecurityConfig lets only signed-in accounts in). */
@RestController
class TimelineController {

    private final TimelineService timeline;
    private final ScholarWorks scholars;

    TimelineController(TimelineService timeline, ScholarWorks scholars) {
        this.timeline = timeline;
        this.scholars = scholars;
    }

    /** Every scholar in the catalogue whose year of death is known (ADR 0010, slice T2): the same for every reader. */
    public record Scholars(List<ScholarWorks.DatedScholar> scholars) {}

    @GetMapping("/api/v1/timeline/scholars")
    Scholars scholars() {
        return new Scholars(scholars.dated());
    }

    @GetMapping("/api/v1/timeline")
    TimelineService.Timeline timeline(Authentication authentication) {
        return timeline.timeline(SignedInUser.id(authentication));
    }
}
