package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.RecordVersion;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.library.ScienceService.Science;
import java.net.URI;
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
 * The signed-in user's sciences (SecurityConfig lets only signed-in accounts in; CSRF is required on changes).
 * A science's version is its ETag; an edit must send it back in If-Match.
 */
@RestController
@RequestMapping("/api/v1/sciences")
class ScienceController {

    private final ScienceService sciences;

    ScienceController(ScienceService sciences) {
        this.sciences = sciences;
    }

    /** What the web app sends to add or rename a science. There is deliberately no owner, ID or version here. */
    public record ScienceInput(String nameAr, String nameEn) {}

    @GetMapping
    ScienceService.ScienceList list(@RequestParam(defaultValue = "ar") String sort, Authentication authentication) {
        if (!sort.equals("ar") && !sort.equals("en")) {
            throw new FieldValidationException("sort", "invalid");
        }
        return sciences.list(SignedInUser.id(authentication), sort.equals("ar"));
    }

    @PostMapping
    ResponseEntity<Science> create(@RequestBody ScienceInput body, Authentication authentication) {
        Science science = sciences.create(SignedInUser.id(authentication), body);
        return ResponseEntity.created(URI.create("/api/v1/sciences/" + science.id()))
                .eTag(RecordVersion.etag(science.version()))
                .body(science);
    }

    @GetMapping("/{id}")
    ResponseEntity<Science> get(@PathVariable UUID id, Authentication authentication) {
        Science science = sciences.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(RecordVersion.etag(science.version())).body(science);
    }

    @PutMapping("/{id}")
    ResponseEntity<Science> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody ScienceInput body,
            Authentication authentication) {
        Science science =
                sciences.update(SignedInUser.id(authentication), id, RecordVersion.fromIfMatch(ifMatch), body);
        return ResponseEntity.ok().eTag(RecordVersion.etag(science.version())).body(science);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        sciences.delete(SignedInUser.id(authentication), id);
    }
}
