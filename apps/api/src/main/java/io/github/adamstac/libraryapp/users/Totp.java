package io.github.adamstac.libraryapp.users;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Locale;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** RFC 6238 time-based one-time codes: HMAC-SHA1, 6 digits, 30-second steps (what every authenticator app uses). */
final class Totp {

    static final int SECRET_BYTES = 20; // 160 bits, as RFC 4226 recommends
    static final long STEP_SECONDS = 30;

    private Totp() {}

    static long stepAt(Instant time) {
        return Math.floorDiv(time.getEpochSecond(), STEP_SECONDS);
    }

    static String code(byte[] secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = ((hash[offset] & 0x7f) << 24)
                    | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8)
                    | (hash[offset + 3] & 0xff);
            return String.format(Locale.ROOT, "%06d", binary % 1_000_000);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA1 is always available", e);
        }
    }

    /**
     * The step a code belongs to, if it is valid now (allowing one step either side for clock drift) and newer
     * than the last code used, so each code works only once.
     */
    static OptionalLong verify(byte[] secret, String code, long nowStep, long lastUsedStep) {
        if (code == null || !code.matches("\\d{6}")) {
            return OptionalLong.empty();
        }
        byte[] given = code.getBytes(StandardCharsets.US_ASCII);
        OptionalLong match = OptionalLong.empty();
        for (long step = nowStep - 1; step <= nowStep + 1; step++) {
            boolean equal = MessageDigest.isEqual(code(secret, step).getBytes(StandardCharsets.US_ASCII), given);
            if (equal && step > lastUsedStep) {
                match = OptionalLong.of(step);
            }
        }
        return match;
    }

    /** People may type Arabic-Indic digits (٠١٢…) or spaces; the code is the same. */
    static String normalizeDigits(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(input.length());
        input.codePoints().forEach(c -> {
            if (c >= '٠' && c <= '٩') {
                out.append((char) ('0' + (c - '٠')));
            } else if (c >= '۰' && c <= '۹') {
                out.append((char) ('0' + (c - '۰')));
            } else if (!Character.isWhitespace(c) && c != '-') {
                out.appendCodePoint(c);
            }
        });
        return out.toString();
    }
}
