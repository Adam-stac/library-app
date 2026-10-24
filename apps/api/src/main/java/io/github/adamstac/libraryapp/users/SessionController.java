package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.InvalidRequestException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
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

    /** Session attributes for someone who has given the right password but not yet the second step. */
    static final String PENDING_USER = "library.signIn.pendingUser";
    static final String PENDING_SINCE = "library.signIn.pendingSince";
    static final Duration SECOND_STEP_TIME_LIMIT = Duration.ofMinutes(5);

    private final LoginService logins;
    private final TwoFactorService twoFactor;
    private final CsrfTokenRepository csrfTokens;
    private final SignInSessions signIns;
    private final SecurityEvents events;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    SessionController(
            LoginService logins,
            TwoFactorService twoFactor,
            CsrfTokenRepository csrfTokens,
            SignInSessions signIns,
            SecurityEvents events) {
        this.signIns = signIns;
        this.events = events;
        this.logins = logins;
        this.twoFactor = twoFactor;
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

    /** Either the signed-in account, or {@code secondStepRequired} when a code from the app is needed next. */
    public record SignInResult(String email, String language, boolean secondStepRequired) {}

    public record SecondStepRequest(@NotBlank(message = "required") @Size(max = 64, message = "invalid") String code) {}

    /** Gives the web app a CSRF token cookie before it signs in (the token is set by the CSRF filter). */
    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void csrf() {}

    @PostMapping("/login")
    SignInResult login(
            @Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        LoginService.Account account = logins.authenticate(body.email(), body.password())
                .orElseThrow(() -> new InvalidRequestException("invalid_credentials"));

        // Session fixation: never carry a session from before sign-in; always start a brand-new one
        HttpSession previous = request.getSession(false);
        if (previous != null) {
            previous.invalidate();
        }
        HttpSession session = request.getSession(true);

        if (twoFactor.isEnabled(account.id())) {
            // The password was right, but this is not a signed-in session yet: it only remembers who is
            // half-way through, for a few minutes
            session.setAttribute(PENDING_USER, account.id().toString());
            session.setAttribute(PENDING_SINCE, System.currentTimeMillis());
            return new SignInResult(null, null, true);
        }
        signIns.complete(account, SignInSessions.BY_PASSWORD, request, response);
        return new SignInResult(account.email(), account.language(), false);
    }

    /** The second step: a code from the authenticator app, or a recovery code. */
    @PostMapping("/login/2fa")
    SignInResult secondStep(
            @Valid @RequestBody SecondStepRequest body, HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        Object pendingUser = session == null ? null : session.getAttribute(PENDING_USER);
        Object since = session == null ? null : session.getAttribute(PENDING_SINCE);
        if (!(pendingUser instanceof String userId)
                || !(since instanceof Long started)
                || System.currentTimeMillis() - started > SECOND_STEP_TIME_LIMIT.toMillis()) {
            throw new InvalidRequestException("sign_in_again");
        }
        UUID id = UUID.fromString(userId);
        if (!twoFactor.verifySignIn(id, body.code())) {
            throw new InvalidRequestException("invalid_code");
        }
        LoginService.Account account =
                logins.findAccount(id).orElseThrow(() -> new InvalidRequestException("sign_in_again"));

        session.removeAttribute(PENDING_USER);
        session.removeAttribute(PENDING_SINCE);
        request.changeSessionId(); // a new session ID now that the person is fully signed in
        signIns.complete(account, SignInSessions.BY_PASSWORD_AND_CODE, request, response);
        return new SignInResult(account.email(), account.language(), false);
    }

    /** Ends the session on the server, so a copied cookie stops working immediately. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request, HttpServletResponse response) {
        Authentication current = contextHolder.getContext().getAuthentication();
        if (current != null && current.isAuthenticated() && !(current instanceof AnonymousAuthenticationToken)) {
            events.record(UUID.fromString(current.getName()), SecurityEvents.SIGN_OUT);
        }
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
