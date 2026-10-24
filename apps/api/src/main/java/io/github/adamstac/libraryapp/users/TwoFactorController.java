package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Managing two-step verification. Signed-in accounts only; every change needs the password again. */
@RestController
@RequestMapping("/api/v1/auth/2fa")
class TwoFactorController {

    private final TwoFactorService twoFactor;

    TwoFactorController(TwoFactorService twoFactor) {
        this.twoFactor = twoFactor;
    }

    public record PasswordOnly(
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword) {}

    public record CodeOnly(@NotBlank(message = "required") @Size(max = 64, message = "invalid") String code) {}

    public record PasswordAndCode(
            @NotNull(message = "required") @Size(max = 1024, message = "too_long") String currentPassword,
            @NotBlank(message = "required") @Size(max = 64, message = "invalid") String code) {}

    public record RecoveryCodesResponse(List<String> recoveryCodes) {}

    @GetMapping
    TwoFactorService.Status status(Authentication authentication) {
        return twoFactor.status(userId(authentication));
    }

    @PostMapping("/totp/setup")
    TwoFactorService.Setup startSetup(@Valid @RequestBody PasswordOnly body, Authentication authentication) {
        return twoFactor.startSetup(userId(authentication), body.currentPassword());
    }

    @PostMapping("/totp/confirm")
    RecoveryCodesResponse confirmSetup(
            @Valid @RequestBody CodeOnly body, Authentication authentication, HttpServletRequest request) {
        List<String> codes = twoFactor.confirmSetup(userId(authentication), request.getSession().getId(), body.code());
        request.changeSessionId(); // a new session ID after a security change
        return new RecoveryCodesResponse(codes);
    }

    @PostMapping("/totp/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disable(@Valid @RequestBody PasswordAndCode body, Authentication authentication, HttpServletRequest request) {
        twoFactor.disable(userId(authentication), request.getSession().getId(), body.currentPassword(), body.code());
        request.changeSessionId();
    }

    @PostMapping("/recovery-codes")
    RecoveryCodesResponse newRecoveryCodes(@Valid @RequestBody PasswordOnly body, Authentication authentication) {
        return new RecoveryCodesResponse(twoFactor.newRecoveryCodes(userId(authentication), body.currentPassword()));
    }

    private static UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
