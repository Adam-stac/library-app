package io.github.adamstac.libraryapp.pages;

import io.github.adamstac.libraryapp.SignedInUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reading a book's cover or title page (ADR 0011). Signed-in accounts only, with the CSRF token for the reading itself
 * (SecurityConfig). The body is the photo and nothing else: a JPEG or PNG of at most 4 MB.
 */
@RestController
class PageReadingController {

    private final PageReadingService readings;

    PageReadingController(PageReadingService readings) {
        this.readings = readings;
    }

    /** Whether reading is on, and how many readings are left today and this month */
    @GetMapping("/api/v1/page-readings/status")
    PageReadingService.Status status(Authentication authentication) {
        return readings.status(SignedInUser.id(authentication));
    }

    @PostMapping(path = "/api/v1/page-readings", consumes = {"image/jpeg", "image/png"})
    PageReadingService.Reading read(@RequestBody byte[] image, Authentication authentication) {
        return readings.read(SignedInUser.id(authentication), image);
    }
}
