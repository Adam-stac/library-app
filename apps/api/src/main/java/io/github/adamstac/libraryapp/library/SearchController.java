package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.TextInput;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Searching the signed-in user's library (SecurityConfig lets only signed-in accounts in). */
@RestController
class SearchController {

    static final int MAX_QUERY = 100;
    static final int MAX_PER_KIND = 50;

    private final SearchService search;

    SearchController(SearchService search) {
        this.search = search;
    }

    /**
     * {@code q} is what to look for (at most 100 characters, with at least one letter or digit); {@code limit} is
     * how many of each kind to return (at most 50; the totals are always given).
     */
    @GetMapping("/api/v1/search")
    SearchService.Results search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "10") int limit,
            Authentication authentication) {
        String text = TextInput.line("q", q, MAX_QUERY);
        if (text == null || text.codePoints().noneMatch(Character::isLetterOrDigit)) {
            throw new FieldValidationException("q", "required");
        }
        int perKind = Math.max(1, Math.min(limit, MAX_PER_KIND));
        return search.search(SignedInUser.id(authentication), text, perKind);
    }
}
