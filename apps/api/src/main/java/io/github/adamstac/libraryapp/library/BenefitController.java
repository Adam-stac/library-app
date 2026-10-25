package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.RecordVersion;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.library.BenefitService.Benefit;
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
 * The signed-in user's benefits, added in the app (SecurityConfig lets only signed-in accounts in; CSRF is required
 * on changes). A benefit's version is its ETag; an edit must send it back in If-Match.
 */
@RestController
@RequestMapping("/api/v1/benefits")
class BenefitController {

    static final int MAX_PAGE_SIZE = 100;

    private final BenefitService benefits;

    BenefitController(BenefitService benefits) {
        this.benefits = benefits;
    }

    /**
     * What the web app sends to add or edit a benefit: the text, and optionally an edition with a volume and page.
     * There is deliberately no owner, ID, version or source here.
     */
    public record BenefitInput(String text, UUID editionId, Integer volume, Integer page) {}

    @GetMapping
    BenefitService.Page list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID editionId,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return benefits.list(SignedInUser.id(authentication), editionId, page, pageSize);
    }

    @PostMapping
    ResponseEntity<Benefit> create(@RequestBody BenefitInput body, Authentication authentication) {
        Benefit benefit = benefits.create(SignedInUser.id(authentication), BenefitService.Source.APP, body);
        return ResponseEntity.created(URI.create("/api/v1/benefits/" + benefit.id()))
                .eTag(RecordVersion.etag(benefit.version()))
                .body(benefit);
    }

    @GetMapping("/{id}")
    ResponseEntity<Benefit> get(@PathVariable UUID id, Authentication authentication) {
        Benefit benefit = benefits.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(RecordVersion.etag(benefit.version())).body(benefit);
    }

    @PutMapping("/{id}")
    ResponseEntity<Benefit> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody BenefitInput body,
            Authentication authentication) {
        Benefit benefit =
                benefits.update(SignedInUser.id(authentication), id, RecordVersion.fromIfMatch(ifMatch), body);
        return ResponseEntity.ok().eTag(RecordVersion.etag(benefit.version())).body(benefit);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        benefits.delete(SignedInUser.id(authentication), id);
    }
}
