package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.InvalidRequestException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Passkeys. Managing them needs a signed-in session and the password again; signing in with one is open.
 * Each ceremony's challenge lives in the session for 5 minutes and can be answered only once.
 */
@RestController
@RequestMapping("/api/v1/auth/passkeys")
class PasskeyController {

    static final String REGISTRATION = "library.passkey.registration";
    static final String SIGN_IN = "library.passkey.signIn";
    static final Duration CHALLENGE_LIFETIME = Duration.ofMinutes(5);

    private final PasskeyService passkeys;
    private final SignInSessions signIns;

    PasskeyController(PasskeyService passkeys, SignInSessions signIns) {
        this.passkeys = passkeys;
        this.signIns = signIns;
    }

    public record PasswordOnly(
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword) {}

    public record NewPasskey(
            @NotBlank(message = "required")
                    @Size(max = 64, message = "too_long")
                    @Pattern(regexp = "[^\\p{Cntrl}]+", message = "invalid")
                    String label,
            @NotNull(message = "required") Map<String, Object> credential) {
        public NewPasskey {
            label = label == null ? null : label.strip();
        }
    }

    public record PasskeyAnswer(@NotNull(message = "required") Map<String, Object> credential) {}

    @GetMapping
    List<PasskeyService.Passkey> list(Authentication authentication) {
        return passkeys.list(userId(authentication));
    }

    @PostMapping("/register/options")
    Map<String, Object> startRegistration(
            @Valid @RequestBody PasswordOnly body, Authentication authentication, HttpServletRequest request) {
        PasskeyService.Ceremony ceremony = passkeys.startRegistration(userId(authentication), body.currentPassword());
        remember(request.getSession(), REGISTRATION, ceremony.challenge());
        return ceremony.options();
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    PasskeyService.Passkey finishRegistration(
            @Valid @RequestBody NewPasskey body, Authentication authentication, HttpServletRequest request) {
        byte[] challenge = takeChallenge(request.getSession(false), REGISTRATION);
        return passkeys.finishRegistration(userId(authentication), challenge, body.credential(), body.label());
    }

    @PostMapping("/{id}/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable UUID id, @Valid @RequestBody PasswordOnly body, Authentication authentication) {
        passkeys.remove(userId(authentication), id, body.currentPassword());
    }

    /** Starts signing in. Uses a short-lived session to hold the challenge until the browser answers. */
    @PostMapping("/login/options")
    Map<String, Object> startSignIn(HttpServletRequest request) {
        HttpSession session = request.getSession(true);
        if (session.isNew()) {
            session.setMaxInactiveInterval((int) CHALLENGE_LIFETIME.toSeconds());
        }
        PasskeyService.Ceremony ceremony = passkeys.startSignIn();
        remember(session, SIGN_IN, ceremony.challenge());
        return ceremony.options();
    }

    @PostMapping("/login")
    SessionController.SignInResult finishSignIn(
            @Valid @RequestBody PasskeyAnswer body, HttpServletRequest request, HttpServletResponse response) {
        byte[] challenge = takeChallenge(request.getSession(false), SIGN_IN);
        LoginService.Account account = passkeys.finishSignIn(challenge, body.credential())
                .orElseThrow(() -> new InvalidRequestException("invalid_passkey"));
        signIns.startFresh(request);
        signIns.complete(account, SignInSessions.BY_PASSKEY, request, response);
        return new SessionController.SignInResult(account.email(), account.language(), false);
    }

    private static void remember(HttpSession session, String name, byte[] challenge) {
        session.setAttribute(name, challenge);
        session.setAttribute(name + ".since", System.currentTimeMillis());
    }

    /** The challenge works once: it's removed as soon as it's read, whatever happens next. */
    private static byte[] takeChallenge(HttpSession session, String name) {
        if (session == null) {
            throw new InvalidRequestException("start_again");
        }
        Object challenge = session.getAttribute(name);
        Object since = session.getAttribute(name + ".since");
        session.removeAttribute(name);
        session.removeAttribute(name + ".since");
        if (!(challenge instanceof byte[] bytes)
                || !(since instanceof Long started)
                || System.currentTimeMillis() - started > CHALLENGE_LIFETIME.toMillis()) {
            throw new InvalidRequestException("start_again");
        }
        return bytes;
    }

    private static UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
