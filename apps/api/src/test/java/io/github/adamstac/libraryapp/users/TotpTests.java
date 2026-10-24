package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class TotpTests {

    /** The RFC 6238 appendix B test secret for HMAC-SHA1. */
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @Test
    void matchesTheRfc6238TestVectors() {
        // RFC 6238 gives 8-digit codes; ours are their last 6 digits
        assertThat(Totp.code(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(59)))).isEqualTo("287082");
        assertThat(Totp.code(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(1111111109)))).isEqualTo("081804");
        assertThat(Totp.code(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(1234567890)))).isEqualTo("005924");
        assertThat(Totp.code(RFC_SECRET, Totp.stepAt(Instant.ofEpochSecond(2000000000)))).isEqualTo("279037");
    }

    @Test
    void acceptsOneStepEitherSideForClockDrift() {
        long now = 1000;
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, now - 1), now, 0)).hasValue(now - 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, now + 1), now, 0)).hasValue(now + 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, now - 2), now, 0)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, now + 2), now, 0)).isEmpty();
    }

    @Test
    void aCodeAlreadyUsedIsRejected() {
        long now = 1000;
        String code = Totp.code(RFC_SECRET, now);

        assertThat(Totp.verify(RFC_SECRET, code, now, now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, now - 1), now, now)).isEmpty();
    }

    @Test
    void rejectsAnythingThatIsNotSixDigits() {
        for (String code : new String[] {null, "", "12345", "1234567", "abcdef", "12 345", "١٢٣٤٥٦"}) {
            assertThat(Totp.verify(RFC_SECRET, code, 1000, 0)).as(String.valueOf(code)).isEmpty();
        }
    }

    @Test
    void normalisesArabicIndicDigitsAndSpaces() {
        assertThat(Totp.normalizeDigits("١٢٣ ٤٥٦")).isEqualTo("123456");
        assertThat(Totp.normalizeDigits("۷۸۹-۰۱۲")).isEqualTo("789012");
        assertThat(Totp.normalizeDigits(null)).isEmpty();
    }

    @Test
    void base32MatchesRfc4648() {
        assertThat(Base32.encode("foobar".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTBOI");
        assertThat(Base32.encode("f".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MY");
        assertThat(new String(Base32.decode("mzxw6ytboi"), StandardCharsets.US_ASCII)).isEqualTo("foobar");
        assertThat(Base32.decode(Base32.encode(RFC_SECRET))).isEqualTo(RFC_SECRET);
        assertThatThrownBy(() -> Base32.decode("not base32!")).isInstanceOf(IllegalArgumentException.class);
    }
}
