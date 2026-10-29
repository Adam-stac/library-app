package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.SignedInUser;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in user's bin (ADR 0009): deleted books and benefits, kept for 30 days. Put one back, delete one for
 * good, or empty the bin. SecurityConfig lets only signed-in accounts in; CSRF is required on changes.
 */
@RestController
@RequestMapping("/api/v1/bin")
class BinController {

    private final BinService bin;

    BinController(BinService bin) {
        this.bin = bin;
    }

    @GetMapping
    BinService.Contents list(Authentication authentication) {
        return bin.list(SignedInUser.id(authentication));
    }

    @PostMapping("/{id}/restore")
    BinService.Restored restore(@PathVariable UUID id, Authentication authentication) {
        return bin.restore(SignedInUser.id(authentication), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, Authentication authentication) {
        bin.delete(SignedInUser.id(authentication), id);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void empty(Authentication authentication) {
        bin.empty(SignedInUser.id(authentication));
    }
}
