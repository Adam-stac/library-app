package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.InvalidRequestException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class SessionController {

    private final LoginService logins;
    private final CsrfTokenRepository csrfTokens;
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    SessionController(LoginService logins, CsrfTokenRepository csrfTokens) {
        this.logins = logins;
        this.csrfTokens = csrfTokens;
    }

    public record LoginRequest(
            @NotBlank(message = "required") @Size(max = 254, message = "too_long") String email,
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String password) {
        public LoginRequest {
            email = email == null ? null : email.strip();
        }
    }

    public record CurrentUser(String email, String language) {}

    /** Gives the web app a CSRF token cookie before it signs in (the token is set by the CSRF filter). */
    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void csrf() {}

    @PostMapping("/login")
    CurrentUser login(
            @Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        LoginService.Account account = logins.authenticate(body.email(), body.password())
                .orElseThrow(() -> new InvalidRequestException("invalid_credentials"));

        // Session fixation: never carry a session from before sign-in; always start a brand-new one
        HttpSession previous = request.getSession(false);
        if (previous != null) {
            previous.invalidate();
        }
        request.getSession(true);

        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                account.id().toString(), null, AuthorityUtils.createAuthorityList("ROLE_USER")));
        contextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        // A fresh CSRF token after sign-in (the old one is cleared; the next request receives a new one)
        csrfTokens.saveToken(null, request, response);
        return new CurrentUser(account.email(), account.language());
    }

    /** Ends the session on the server, so a copied cookie stops working immediately. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        contextHolder.clearContext();
        csrfTokens.saveToken(null, request, response);
    }

    /**
     * Who is signed in: 200 with the account, or 204 when nobody is. Not 401: every page asks this, and
     * browsers log each 401 as an error, which would hide real errors.
     */
    @GetMapping("/me")
    ResponseEntity<CurrentUser> me(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.noContent().build();
        }
        return logins.findAccount(UUID.fromString(authentication.getName()))
                .map(account -> ResponseEntity.ok(new CurrentUser(account.email(), account.language())))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
