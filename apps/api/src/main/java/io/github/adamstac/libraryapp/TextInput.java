package io.github.adamstac.libraryapp;

import java.text.Normalizer;

/**
 * Rules for text people type into their library (ADR 0006). Text is trimmed and normalised to Unicode NFC
 * (not NFKC, which would expand ﷺ into the full phrase), and its length is counted in characters, as Postgres
 * counts them. Control characters are refused, and so are the bidirectional embedding, override and isolate
 * characters, which can make text display differently from what is stored. Blank text means "not given".
 */
public final class TextInput {

    private TextInput() {}

    /** A single line, such as a name or a title. Returns null when blank. */
    public static String line(String field, String value, int maxLength) {
        return clean(field, value, maxLength, false);
    }

    /** Text that may have several lines, such as a biography or notes. Returns null when blank. */
    public static String paragraphs(String field, String value, int maxLength) {
        return clean(field, value, maxLength, true);
    }

    private static String clean(String field, String value, int maxLength, boolean multiline) {
        if (value == null) {
            return null;
        }
        String text = value.replace("\r\n", "\n").replace('\r', '\n');
        // Checked before normalising, so nothing invalid (such as a lone surrogate) ever reaches the normaliser
        if (!text.codePoints().allMatch(codePoint -> allowed(codePoint, multiline))) {
            throw new FieldValidationException(field, "invalid_characters");
        }
        text = Normalizer.normalize(text, Normalizer.Form.NFC).strip();
        if (text.isEmpty()) {
            return null;
        }
        if (text.codePointCount(0, text.length()) > maxLength) {
            throw new FieldValidationException(field, "too_long");
        }
        return text;
    }

    private static boolean allowed(int codePoint, boolean multiline) {
        if (codePoint == '\n' || codePoint == '\t') {
            return multiline;
        }
        if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
            return false; // half of a character on its own (a lone surrogate): Postgres would refuse it
        }
        if ((codePoint >= 0x202A && codePoint <= 0x202E) || (codePoint >= 0x2066 && codePoint <= 0x2069)) {
            return false; // bidirectional embedding, override and isolate characters
        }
        return Character.getType(codePoint) != Character.CONTROL; // includes NUL, which Postgres can't store
    }
}
