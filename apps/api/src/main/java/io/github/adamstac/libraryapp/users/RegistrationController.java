package io.github.adamstac.libraryapp.users;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class RegistrationController {

    private final RegistrationService registrations;

    RegistrationController(RegistrationService registrations) {
        this.registrations = registrations;
    }

    /** Validation messages are codes, translated by the web app. Only these fields are accepted. */
    public record RegisterRequest(
            @NotBlank(message = "required") @Email(message = "invalid_email") @Size(max = 254, message = "too_long")
                    String email,
            @NotNull(message = "required") String password,
            @NotNull(message = "required") @Pattern(regexp = "ar|en", message = "invalid") String language) {
        /** People often paste emails with stray spaces; trim before validating. */
        public RegisterRequest {
            email = email == null ? null : email.strip();
        }
    }

    public record VerifyEmailRequest(
            @NotBlank(message = "required") @Size(max = 100, message = "invalid") String token) {}

    /** 202 with no body, whether or not the email already has an account (no account enumeration). */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void register(@Valid @RequestBody RegisterRequest request) {
        registrations.register(request.email(), request.password(), request.language());
    }

    @PostMapping("/verify-email")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        registrations.verify(request.token());
    }
}
