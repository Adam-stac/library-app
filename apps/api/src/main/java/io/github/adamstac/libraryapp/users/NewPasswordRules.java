package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import org.springframework.stereotype.Component;

/** The rules every new password must meet (registration, reset, change): NIST SP 800-63B. */
@Component
class NewPasswordRules {

    private final PasswordBreachCheck breachCheck;

    NewPasswordRules(PasswordBreachCheck breachCheck) {
        this.breachCheck = breachCheck;
    }

    /** Throws a field error with {@code field} as its name. The password must already be NFKC-normalised. */
    void check(String normalizedPassword, String field) {
        int length = PasswordPolicy.length(normalizedPassword);
        if (length < PasswordPolicy.MIN_LENGTH) {
            throw new FieldValidationException(field, "too_short");
        }
        if (length > PasswordPolicy.MAX_LENGTH) {
            throw new FieldValidationException(field, "too_long");
        }
        if (breachCheck.isCompromised(normalizedPassword)) {
            throw new FieldValidationException(field, "compromised");
        }
    }
}
