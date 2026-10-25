package io.github.adamstac.libraryapp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class TextInputTests {

    @Test
    void textIsTrimmedAndBlankMeansNotGiven() {
        assertThat(TextInput.line("name", "  البخاري  ", 200)).isEqualTo("البخاري");
        assertThat(TextInput.line("name", "   ", 200)).isNull();
        assertThat(TextInput.line("name", null, 200)).isNull();
    }

    @Test
    void textIsNormalisedToNfcButKeepsTheSalutationSign() {
        // Alif followed by a combining hamza becomes the single letter أ
        assertThat(TextInput.line("name", "أحمد", 200)).isEqualTo("أحمد");
        // NFKC would expand ﷺ into the full phrase; NFC keeps it
        assertThat(TextInput.line("name", "النبي ﷺ", 200)).isEqualTo("النبي ﷺ");
    }

    @Test
    void lengthIsCountedInCharactersNotBytes() {
        String twoHundredArabic = "ب".repeat(200);
        assertThat(TextInput.line("name", twoHundredArabic, 200)).isEqualTo(twoHundredArabic);
        String emoji = "😀".repeat(200); // two Java chars each, but one character each in Postgres
        assertThat(TextInput.line("name", emoji, 200)).isEqualTo(emoji);
        assertThatThrownBy(() -> TextInput.line("name", "ب".repeat(201), 200))
                .isInstanceOfSatisfying(FieldValidationException.class, e -> {
                    assertThat(e.field()).isEqualTo("name");
                    assertThat(e.code()).isEqualTo("too_long");
                });
    }

    @Test
    void directionControlCharactersAreRefused() {
        for (String sneaky : new String[] {"‪", "‫", "‬", "‭", "‮", "⁦", "⁩"}) {
            assertThatThrownBy(() -> TextInput.line("name", "abc" + sneaky + "def", 200))
                    .as("U+%04X", (int) sneaky.charAt(0))
                    .isInstanceOfSatisfying(FieldValidationException.class,
                            e -> assertThat(e.code()).isEqualTo("invalid_characters"));
        }
        // The ordinary right-to-left and left-to-right marks are harmless and sometimes needed
        assertThat(TextInput.line("name", "abc‏def", 200)).isEqualTo("abc‏def");
    }

    @Test
    void controlCharactersAndBrokenCharactersAreRefused() {
        for (String bad : new String[] {"\u0000", "\u0007", "\u001B", "\u007F", "\u0085", "\uD800", "\uDC00"}) {
            assertThatThrownBy(() -> TextInput.line("name", "abc" + bad, 200))
                    .isInstanceOfSatisfying(FieldValidationException.class,
                            e -> assertThat(e.code()).isEqualTo("invalid_characters"));
        }
    }

    @Test
    void onlyParagraphsMayHaveSeveralLines() {
        assertThat(TextInput.paragraphs("biography", "First line\r\nSecond\rThird\n\tIndented", 100))
                .isEqualTo("First line\nSecond\nThird\n\tIndented");
        assertThatThrownBy(() -> TextInput.line("name", "First\nSecond", 100))
                .isInstanceOfSatisfying(FieldValidationException.class,
                        e -> assertThat(e.code()).isEqualTo("invalid_characters"));
    }
}
