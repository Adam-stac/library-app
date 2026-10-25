package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.RecordVersion;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.library.WorkService.Work;
import java.net.URI;
import java.util.List;
import java.util.UUID;
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
 * The signed-in user's works (SecurityConfig lets only signed-in accounts in; CSRF is required on changes).
 * A work's version is its ETag; an edit must send it back in If-Match.
 */
@RestController
@RequestMapping("/api/v1/works")
class WorkController {

    static final int MAX_PAGE_SIZE = 100;

    private final WorkService works;

    WorkController(WorkService works) {
        this.works = works;
    }

    /**
     * What the web app sends to add or edit a work. {@code authorIds} is in the order the authors are named. There
     * is deliberately no owner, ID or version here.
     */
    public record WorkInput(String titleAr, String titleEn, UUID scienceId, List<UUID> authorIds) {}

    @GetMapping
    WorkService.Page list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "ar") String sort,
            @RequestParam(required = false) UUID scienceId,
            @RequestParam(required = false) UUID authorId,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        if (!sort.equals("ar") && !sort.equals("en")) {
            throw new FieldValidationException("sort", "invalid");
        }
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return works.list(
                SignedInUser.id(authentication),
                new WorkService.Filter(scienceId, authorId),
                page,
                pageSize,
                sort.equals("ar"));
    }

    @PostMapping
    ResponseEntity<Work> create(@RequestBody WorkInput body, Authentication authentication) {
        Work work = works.create(SignedInUser.id(authentication), body);
        return ResponseEntity.created(URI.create("/api/v1/works/" + work.id()))
                .eTag(RecordVersion.etag(work.version()))
                .body(work);
    }

    @GetMapping("/{id}")
    ResponseEntity<Work> get(@PathVariable UUID id, Authentication authentication) {
        Work work = works.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(RecordVersion.etag(work.version())).body(work);
    }

    @PutMapping("/{id}")
    ResponseEntity<Work> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody WorkInput body,
            Authentication authentication) {
        Work work = works.update(SignedInUser.id(authentication), id, RecordVersion.fromIfMatch(ifMatch), body);
        return ResponseEntity.ok().eTag(RecordVersion.etag(work.version())).body(work);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        works.delete(SignedInUser.id(authentication), id);
    }
}
