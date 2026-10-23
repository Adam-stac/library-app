package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordPolicyTests {

    @Test
    void countsRealCharactersNotJavaChars() {
        // Emoji take two Java chars each but are one character to a person
        String emoji = "😀".repeat(15);
        assertThat(PasswordPolicy.length(PasswordPolicy.normalize(emoji))).isEqualTo(15);
    }

    @Test
    void arabicLettersCountOneEach() {
        assertThat(PasswordPolicy.length(PasswordPolicy.normalize("ابتثجحخدذرزسشصض"))).isEqualTo(15);
    }

    @Test
    void normalisesEquivalentCharactersToTheSamePassword() {
        // "ﬁ" (one ligature character) and "fi" must hash the same
        assertThat(PasswordPolicy.normalize("ﬁsh")).isEqualTo("fish");
    }
}
