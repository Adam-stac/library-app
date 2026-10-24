package io.github.adamstac.libraryapp.users;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Recovery codes: 80 random bits each, written as XXXX-XXXX-XXXX-XXXX in Crockford Base32 (no I, L, O or U,
 * so they're hard to misread). Only a SHA-256 of each is stored; 80 bits makes guessing from a leaked hash
 * impractical.
 */
final class RecoveryCodes {

    static final int COUNT = 10;
    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final int LENGTH = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    private RecoveryCodes() {}

    static List<String> generate() {
        List<String> codes = new ArrayList<>(COUNT);
        for (int i = 0; i < COUNT; i++) {
            StringBuilder code = new StringBuilder();
            for (int c = 0; c < LENGTH; c++) {
                if (c > 0 && c % 4 == 0) {
                    code.append('-');
                }
                code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            codes.add(code.toString());
        }
        return codes;
    }

    /** The canonical form of what someone typed: no dashes or spaces, upper case, look-alikes fixed. */
    static Optional<String> normalize(String input) {
        if (input == null) {
            return Optional.empty();
        }
        String code = input.replaceAll("[\\s-]", "")
                .toUpperCase(Locale.ROOT)
                .replace('O', '0')
                .replace('I', '1')
                .replace('L', '1');
        if (code.length() != LENGTH || !code.chars().allMatch(c -> ALPHABET.indexOf(c) >= 0)) {
            return Optional.empty();
        }
        return Optional.of(code);
    }

    static String hash(String normalizedCode) {
        return Tokens.hash(normalizedCode);
    }
}
