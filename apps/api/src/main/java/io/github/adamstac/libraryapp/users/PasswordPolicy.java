package io.github.adamstac.libraryapp.users;

import java.text.Normalizer;

/**
 * NIST SP 800-63B rules: length only, no composition rules, no expiry.
 * Passwords are NFKC-normalised so the same password always hashes the same,
 * and length is counted in real characters (Arabic letters and emoji count as one).
 */
final class PasswordPolicy {

    static final int MIN_LENGTH = 15;
    static final int MAX_LENGTH = 128;

    private PasswordPolicy() {}

    static String normalize(String password) {
        return Normalizer.normalize(password, Normalizer.Form.NFKC);
    }

    static int length(String normalizedPassword) {
        return normalizedPassword.codePointCount(0, normalizedPassword.length());
    }
}
