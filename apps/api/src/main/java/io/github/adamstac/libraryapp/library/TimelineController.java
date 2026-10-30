package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.SignedInUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in user's authors timeline (SecurityConfig lets only signed-in accounts in). */
@RestController
class TimelineController {

    private final TimelineService timeline;

    TimelineController(TimelineService timeline) {
        this.timeline = timeline;
    }

    @GetMapping("/api/v1/timeline")
    TimelineService.Timeline timeline(Authentication authentication) {
        return timeline.timeline(SignedInUser.id(authentication));
    }
}
