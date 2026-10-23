package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class PasswordController {

    private final PasswordService passwords;

    PasswordController(PasswordService passwords) {
        this.passwords = passwords;
    }

    public record ResetRequest(
            @NotBlank(message = "required") @Email(message = "invalid_email") @Size(max = 254, message = "too_long")
                    String email) {
        public ResetRequest {
            email = email == null ? null : email.strip();
        }
    }

    public record ResetConfirmation(
            @NotBlank(message = "required") @Size(max = 100, message = "invalid") String token,
            @NotNull(message = "required") String password) {}

    public record PasswordChange(
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword,
            @NotNull(message = "required") String newPassword) {}

    /** 202 with no body, whether or not the email has an account (no account enumeration). */
    @PostMapping("/password-reset/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void requestReset(@Valid @RequestBody ResetRequest request) {
        passwords.requestReset(request.email());
    }

    @PostMapping("/password-reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirmReset(@Valid @RequestBody ResetConfirmation request) {
        passwords.resetPassword(request.token(), request.password());
    }

    /** Signed in only. Keeps this session (with a new ID) and ends every other one. */
    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void changePassword(
            @Valid @RequestBody PasswordChange body, Authentication authentication, HttpServletRequest request) {
        passwords.changePassword(
                UUID.fromString(authentication.getName()),
                request.getSession().getId(),
                body.currentPassword(),
                body.newPassword());
        request.changeSessionId(); // a new session ID after a security change
    }
}
