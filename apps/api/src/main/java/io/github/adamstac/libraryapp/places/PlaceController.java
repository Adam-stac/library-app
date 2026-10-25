package io.github.adamstac.libraryapp.places;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.RecordVersion;
import io.github.adamstac.libraryapp.SignedInUser;
import io.github.adamstac.libraryapp.places.PlaceService.Place;
import java.net.URI;
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
 * Places: the shared starter list plus the signed-in user's own (SecurityConfig lets only signed-in accounts in;
 * CSRF is required on changes). Shared places can be read but not changed (403 read_only). A place's version is
 * its ETag; an edit must send it back in If-Match.
 */
@RestController
@RequestMapping("/api/v1/places")
class PlaceController {

    static final int MAX_PAGE_SIZE = 100;

    private final PlaceService places;

    PlaceController(PlaceService places) {
        this.places = places;
    }

    /** What the web app sends to add or edit a place. There is deliberately no owner, ID or version here. */
    public record PlaceInput(
            String nameAr,
            String nameEn,
            List<String> otherNames,
            String countryAr,
            String countryEn,
            Double latitude,
            Double longitude) {}

    @GetMapping
    PlaceService.Page list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "ar") String sort,
            @RequestParam(defaultValue = "all") String scope,
            Authentication authentication) {
        if (page < 0) {
            throw new FieldValidationException("page", "invalid");
        }
        if (!sort.equals("ar") && !sort.equals("en")) {
            throw new FieldValidationException("sort", "invalid");
        }
        PlaceService.Scope which = switch (scope) {
            case "all", "mine", "shared" -> PlaceService.Scope.valueOf(scope.toUpperCase(Locale.ROOT));
            default -> throw new FieldValidationException("scope", "invalid");
        };
        int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        return places.list(SignedInUser.id(authentication), which, page, pageSize, sort.equals("ar"));
    }

    @PostMapping
    ResponseEntity<Place> create(@RequestBody PlaceInput body, Authentication authentication) {
        Place place = places.create(SignedInUser.id(authentication), body);
        return ResponseEntity.created(URI.create("/api/v1/places/" + place.id()))
                .eTag(RecordVersion.etag(place.version()))
                .body(place);
    }

    @GetMapping("/{id}")
    ResponseEntity<Place> get(@PathVariable UUID id, Authentication authentication) {
        Place place = places.get(SignedInUser.id(authentication), id);
        return ResponseEntity.ok().eTag(RecordVersion.etag(place.version())).body(place);
    }

    @PutMapping("/{id}")
    ResponseEntity<Place> update(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody PlaceInput body,
            Authentication authentication) {
        Place place = places.update(SignedInUser.id(authentication), id, RecordVersion.fromIfMatch(ifMatch), body);
        return ResponseEntity.ok().eTag(RecordVersion.etag(place.version())).body(place);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        places.delete(SignedInUser.id(authentication), id);
    }
}
