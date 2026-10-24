package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class SecretBoxTests {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private final SecretBox box = new SecretBox(KEY);

    @Test
    void roundTripsAndNeverStoresThePlaintext() {
        byte[] secret = "a 20-byte TOTP seed!".getBytes();

        byte[] sealed = box.encrypt(secret, "user-1");

        assertThat(sealed).hasSize(12 + secret.length + 16); // nonce + ciphertext + tag
        assertThat(new String(sealed)).doesNotContain("TOTP seed");
        assertThat(box.decrypt(sealed, "user-1")).isEqualTo(secret);
    }

    @Test
    void theSameSecretEncryptsDifferentlyEachTime() {
        byte[] secret = new byte[20];

        assertThat(box.encrypt(secret, "user-1")).isNotEqualTo(box.encrypt(secret, "user-1"));
    }

    @Test
    void aBoxCopiedToAnotherAccountWontOpen() {
        byte[] sealed = box.encrypt(new byte[20], "user-1");

        assertThatThrownBy(() -> box.decrypt(sealed, "user-2")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tamperingIsDetected() {
        byte[] sealed = box.encrypt(new byte[20], "user-1");
        sealed[sealed.length - 1] ^= 1;

        assertThatThrownBy(() -> box.decrypt(sealed, "user-1")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesToStartWithoutAProperKey() {
        for (String key : new String[] {"", "   ", "not base64!", Base64.getEncoder().encodeToString(new byte[16])}) {
            assertThatThrownBy(() -> new SecretBox(key))
                    .as(key)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("TOTP_ENCRYPTION_KEY");
        }
    }
}
