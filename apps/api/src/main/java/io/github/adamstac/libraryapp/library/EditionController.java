package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.RecordVersion;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.library.EditionService.Edition;
import io.github.adamstac.libraryapp.library.WorkController.WorkInput;
import java.math.BigDecimal;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
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
 * The signed-in user's editions: the copies on their shelf (SecurityConfig lets only signed-in accounts in; CSRF is
 * required on changes). An edition's version is its ETag; an edit must send it back in If-Match.
 */
@RestController
@RequestMapping("/api/v1/editions")
class EditionController {

    static final int MAX_PAGE_SIZE = 100;

    private final EditionService editions;
    private final EditionSuggestionService suggestions;

    EditionController(EditionService editions, EditionSuggestionService suggestions) {
        this.editions = editions;
        this.suggestions = suggestions;
    }

    /**
     * What the web app sends to add or edit an edition. To add one, send either {@code workId} (an existing work)
     * or {@code work} (a new work, added in the same request). Dates are "yyyy-mm-dd". There is deliberately no
     * owner, ID, version or status here.
     */
    public record EditionInput(
            UUID workId,
            WorkInput work,
            String title,
            String language,
            String translator,
            String muhaqqiq,
            String publisher,
            String publicationPlace,
            PublishedInput published,
            Integer editionNumber,
            Integer volumes,
            String isbn,
            String legalDeposit,
            String shelf,
            String notes,
            LocalDate purchasedOn,
            PriceInput price,
            LocalDate startedOn,
            LocalDate finishedOn) {}

    /** The year of publication as printed: Hijri, CE or both. */
    public record PublishedInput(Integer hijri, Integer ce) {}

    /** An amount (decimal text or a number, such as "95.50") and an ISO 4217 currency code, such as "GBP". */
    public record PriceInput(BigDecimal amount, String currency) {}

    @GetMapping
    EditionService.Page list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "ar") String sort,
            @RequestParam(required = false) UUID workId,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        EditionService.Sort order = switch (sort) {
            case "ar", "en", "added" -> EditionService.Sort.valueOf(sort.toUpperCase(Locale.ROOT));
            default -> throw new FieldValidationException("sort", "invalid");
        };
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return editions.list(SignedInUser.id(authentication), workId, order, page, pageSize);
    }

    /** The copies of this ISBN the signed-in user already has (ADR 0010); nothing is looked up anywhere else. */
    public record IsbnMatches(List<EditionService.EditionSummary> items) {}

    @GetMapping("/by-isbn")
    IsbnMatches byIsbn(
            @RequestParam(required = false) String isbn,
            @RequestParam(required = false) UUID excludeId,
            Authentication authentication) {
        return new IsbnMatches(editions.withIsbn(SignedInUser.id(authentication), isbn, excludeId));
    }

    /**
     * What can be filled in for a copy with this ISBN, from the signed-in user's own books and the ISBN itself
     * (ADR 0010, layer 1). Nothing is looked up anywhere else, and nothing is saved.
     */
    @GetMapping("/suggestions")
    EditionSuggestionService.Suggestions suggestions(
            @RequestParam(required = false) String isbn,
            @RequestParam(required = false) UUID excludeId,
            Authentication authentication) {
        return suggestions.suggest(SignedInUser.id(authentication), isbn, excludeId);
    }

    @PostMapping
    ResponseEntity<Edition> create(@RequestBody EditionInput body, Authentication authentication) {
        Edition edition = editions.create(SignedInUser.id(authentication), body);
        return ResponseEntity.created(URI.create("/api/v1/editions/" + edition.id()))
                .eTag(RecordVersion.etag(edition.version()))
                .body(edition);
    }

    @GetMapping("/{id}")
    ResponseEntity<Edition> get(@PathVariable UUID id, Authentication authentication) {
        Edition edition = editions.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(RecordVersion.etag(edition.version())).body(edition);
    }

    @PutMapping("/{id}")
    ResponseEntity<Edition> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody EditionInput body,
            Authentication authentication) {
        Edition edition =
                editions.update(SignedInUser.id(authentication), id, RecordVersion.fromIfMatch(ifMatch), body);
        return ResponseEntity.ok().eTag(RecordVersion.etag(edition.version())).body(edition);
    }

    /**
     * Moves the copy to the bin, where it is kept for 30 days (ADR 0009). The work stays, unless
     * {@code withWork=ifLast} asks for a work left with no copies to go to the bin with it.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(
            @PathVariable UUID id,
            @RequestParam(required = false) String withWork,
            Authentication authentication) {
        if (withWork != null && !withWork.equals("ifLast")) {
            throw new FieldValidationException("withWork", "invalid");
        }
        editions.delete(SignedInUser.id(authentication), id, withWork != null);
    }
}
