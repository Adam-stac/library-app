package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.SignedInUser;
import java.sql.Types;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in user's library settings (ADR 0007): for now, the currency the edition form fills in. A single
 * setting, so the newest change simply wins (no version). CSRF is required on changes.
 */
@RestController
@RequestMapping("/api/v1/library-settings")
class LibrarySettingsController {

    private final JdbcClient jdbc;

    LibrarySettingsController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** {@code defaultCurrency} is an ISO 4217 code, such as "GBP", or null when none has been chosen. */
    public record LibrarySettings(String defaultCurrency) {}

    @GetMapping
    LibrarySettings get(Authentication authentication) {
        return read(SignedInUser.id(authentication));
    }

    @PutMapping
    LibrarySettings put(@RequestBody LibrarySettings body, Authentication authentication) {
        UUID ownerId = SignedInUser.id(authentication);
        String currency = Money.currency("defaultCurrency", body.defaultCurrency());
        // One statement: adds the row the first time, changes it after that
        jdbc.sql("""
                        INSERT INTO library_settings (owner_id, default_currency) VALUES (:owner, :currency)
                        ON CONFLICT (owner_id) DO UPDATE SET default_currency = :currency, updated_at = now()
                        """)
                .param("owner", ownerId)
                .param("currency", currency, Types.VARCHAR)
                .update();
        return read(ownerId);
    }

    private LibrarySettings read(UUID ownerId) {
        return jdbc.sql("SELECT default_currency FROM library_settings WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query((rs, rowNum) -> new LibrarySettings(rs.getString("default_currency")))
                .optional()
                .orElse(new LibrarySettings(null));
    }
}
