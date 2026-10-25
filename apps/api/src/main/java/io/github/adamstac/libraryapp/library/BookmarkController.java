package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.library.BookmarkService.Bookmark;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Bookmarks: one per edition, at {@code /api/v1/editions/{id}/bookmark}, and the most recently moved ones at
 * {@code /api/v1/bookmarks}. SecurityConfig lets only signed-in accounts in; CSRF is required on changes.
 */
@RestController
class BookmarkController {

    static final int MAX_PAGE_SIZE = 100;

    private final BookmarkService bookmarks;

    BookmarkController(BookmarkService bookmarks) {
        this.bookmarks = bookmarks;
    }

    /** Where to put the bookmark: a page, and for a set of volumes, the volume. */
    public record BookmarkInput(Integer volume, Integer page) {}

    @GetMapping("/api/v1/bookmarks")
    BookmarkService.Page recent(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return bookmarks.recent(SignedInUser.id(authentication), page, pageSize);
    }

    @GetMapping("/api/v1/editions/{id}/bookmark")
    Bookmark get(@PathVariable UUID id, Authentication authentication) {
        return bookmarks.get(SignedInUser.id(authentication), id);
    }

    /** Moves the bookmark (or puts one in). The newest move wins, so there is no If-Match. */
    @PutMapping("/api/v1/editions/{id}/bookmark")
    Bookmark move(@PathVariable UUID id, @RequestBody BookmarkInput body, Authentication authentication) {
        return bookmarks.move(SignedInUser.id(authentication), id, body);
    }

    @DeleteMapping("/api/v1/editions/{id}/bookmark")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable UUID id, Authentication authentication) {
        bookmarks.remove(SignedInUser.id(authentication), id);
    }
}
