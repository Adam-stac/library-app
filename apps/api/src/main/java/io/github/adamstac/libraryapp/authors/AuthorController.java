package io.github.adamstac.libraryapp.authors;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.authors.AuthorService.Author;
import java.net.URI;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * A signed-in user's authors (SecurityConfig lets only signed-in accounts in; CSRF is required on changes).
 * An author's version is its ETag; an edit must send it back in If-Match, so an edit made on another device in the
 * meantime is never silently overwritten.
 */
@RestController
@RequestMapping("/api/v1/authors")
class AuthorController {

    static final int MAX_PAGE_SIZE = 100;
    private static final Pattern VERSION = Pattern.compile("\"(\\d{1,9})\"");

    private final AuthorService authors;

    AuthorController(AuthorService authors) {
        this.authors = authors;
    }

    /** What the web app sends to add or edit an author. There is deliberately no owner, ID or version here. */
    public record AuthorInput(
            String nameAr,
            String nameEn,
            String fullName,
            String ism,
            String kunya,
            String laqab,
            String nisba,
            YearInput birth,
            YearInput death,
            String biography) {}

    public record YearInput(Integer hijri, Integer ce, Boolean approximate) {}

    @GetMapping
    AuthorService.Page list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "ar") String sort,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        if (!sort.equals("ar") && !sort.equals("en")) {
            throw new FieldValidationException("sort", "invalid");
        }
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return authors.list(SignedInUser.id(authentication), page, pageSize, sort.equals("ar"));
    }

    @PostMapping
    ResponseEntity<Author> create(@RequestBody AuthorInput body, Authentication authentication) {
        Author author = authors.create(SignedInUser.id(authentication), body);
        return ResponseEntity.created(URI.create("/api/v1/authors/" + author.id()))
                .eTag(etag(author))
                .body(author);
    }

    @GetMapping("/{id}")
    ResponseEntity<Author> get(@PathVariable UUID id, Authentication authentication) {
        Author author = authors.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(etag(author)).body(author);
    }

    @PutMapping("/{id}")
    ResponseEntity<Author> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody AuthorInput body,
            Authentication authentication) {
        Author author = authors.update(SignedInUser.id(authentication), id, expectedVersion(ifMatch), body);
        return ResponseEntity.ok().eTag(etag(author)).body(author);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        authors.delete(SignedInUser.id(authentication), id);
    }

    private static String etag(Author author) {
        return "\"" + author.version() + "\"";
    }

    /** The version the edit started from, sent as {@code If-Match: "3"}. */
    static int expectedVersion(String ifMatch) {
        var match = ifMatch == null ? null : VERSION.matcher(ifMatch.strip());
        if (match == null || !match.matches()) {
            throw new InvalidRequestException("version_required");
        }
        return Integer.parseInt(match.group(1));
    }
}
