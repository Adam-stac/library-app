package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Account settings. Everything here needs a signed-in session, except opening the link sent to a new address. */
@RestController
@RequestMapping("/api/v1/auth")
class AccountController {

    private final AccountService accounts;
    private final CsrfTokenRepository csrfTokens;

    AccountController(AccountService accounts, CsrfTokenRepository csrfTokens) {
        this.accounts = accounts;
        this.csrfTokens = csrfTokens;
    }

    public record Preferences(
            @NotNull(message = "required") @Pattern(regexp = "ar|en", message = "invalid") String language) {}

    public record EmailChange(
            @NotBlank(message = "required") @Email(message = "invalid_email") @Size(max = 254, message = "too_long")
                    String newEmail,
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword,
            @Size(max = 64, message = "invalid") String code) {
        public EmailChange {
            newEmail = newEmail == null ? null : newEmail.strip();
        }
    }

    public record EmailChangeConfirmation(@NotBlank(message = "required") @Size(max = 100, message = "invalid") String token) {}

    public record AccountDeletion(
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword,
            @Size(max = 64, message = "invalid") String code) {}

    @PostMapping("/preferences")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void preferences(@Valid @RequestBody Preferences body, Authentication authentication) {
        accounts.setLanguage(userId(authentication), body.language());
    }

    /** 202: the link is on its way to the new address (the same answer whether or not that address has an account). */
    @PostMapping("/change-email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void changeEmail(@Valid @RequestBody EmailChange body, Authentication authentication) {
        accounts.requestEmailChange(userId(authentication), body.currentPassword(), body.code(), body.newEmail());
    }

    @PostMapping("/confirm-email-change")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirmEmailChange(@Valid @RequestBody EmailChangeConfirmation body, HttpServletRequest request) {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        boolean signedIn = current != null && current.isAuthenticated() && !(current instanceof AnonymousAuthenticationToken);
        HttpSession session = request.getSession(false);
        accounts.confirmEmailChange(
                body.token(), signedIn ? current.getName() : null, session == null ? null : session.getId());
        if (signedIn) {
            request.changeSessionId(); // a new session ID after a security change
        }
    }

    /** Deletes the account for good, then ends this session too. */
    @PostMapping("/delete-account")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteAccount(
            @Valid @RequestBody AccountDeletion body,
            Authentication authentication,
            HttpServletRequest request,
            HttpServletResponse response) {
        accounts.deleteAccount(userId(authentication), body.currentPassword(), body.code());
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        csrfTokens.saveToken(null, request, response);
    }

    private static UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
