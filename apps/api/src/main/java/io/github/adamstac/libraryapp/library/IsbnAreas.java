package io.github.adamstac.libraryapp.library;

import java.util.List;
import java.util.Optional;

/**
 * The language a book is most likely in, from its ISBN's country or language code (ADR 0010, layer 1). A short list
 * written by hand: the Arab countries' codes and the other areas whose books are nearly all in one language. It is a
 * few public facts, not a copy of the ISBN Agency's file, so it works whether or not the ranges are imported.
 *
 * <p>Several countries have more than one code: an older one and newer ones given as the older ran out (Algeria has
 * four). Each was checked against the Agency's own names on 30 October 2026. Areas whose books are in several
 * languages (Pakistan, India, Malaysia, Afghanistan, Bosnia) are left out, so they suggest nothing.
 */
final class IsbnAreas {

    /**
     * An area: the digits an ISBN-13 starts with, the country (ISO 3166, or null for a language area such as
     * "English language"), and the language (ISO 639-1).
     */
    record Area(String prefix, String country, String language) {}

    private static final List<Area> AREAS = List.of(
            // Arabic
            area("978977", "EG", "ar"), area("978633", "EG", "ar"),
            area("9789953", "LB", "ar"), area("978614", "LB", "ar"),
            area("9789933", "SY", "ar"),
            area("9789960", "SA", "ar"), area("978603", "SA", "ar"),
            area("9789957", "JO", "ar"), area("9789923", "JO", "ar"),
            area("9789948", "AE", "ar"),
            area("9789959", "LY", "ar"),
            area("9789954", "MA", "ar"), area("9789920", "MA", "ar"), area("9789981", "MA", "ar"),
            area("9789961", "DZ", "ar"), area("9789931", "DZ", "ar"), area("9789947", "DZ", "ar"),
            area("9789969", "DZ", "ar"),
            area("9789973", "TN", "ar"), area("9789938", "TN", "ar"), area("9789909", "TN", "ar"),
            area("97899901", "BH", "ar"), area("97899958", "BH", "ar"),
            area("97899906", "KW", "ar"), area("9789921", "KW", "ar"), area("97899966", "KW", "ar"),
            area("97899921", "QA", "ar"), area("9789927", "QA", "ar"),
            area("97899969", "OM", "ar"), area("97899992", "OM", "ar"),
            area("9789950", "PS", "ar"),
            area("9789922", "IQ", "ar"),
            area("97899942", "SD", "ar"), area("97899988", "SD", "ar"),
            // Persian, Turkish, Indonesian
            area("978600", "IR", "fa"), area("978622", "IR", "fa"), area("978964", "IR", "fa"), area("978635", "IR", "fa"),
            area("978975", "TR", "tr"), area("978605", "TR", "tr"), area("978625", "TR", "tr"), area("9789944", "TR", "tr"),
            area("978602", "ID", "id"), area("978623", "ID", "id"), area("978634", "ID", "id"), area("978979", "ID", "id"),
            // Language areas and single-language countries
            area("9780", null, "en"), area("9781", null, "en"), area("9798", "US", "en"),
            area("9782", null, "fr"), area("97910", "FR", "fr"),
            area("9783", null, "de"),
            area("9784", "JP", "ja"),
            area("9787", "CN", "zh"),
            area("97884", "ES", "es"), area("97913", "ES", "es"),
            area("97888", "IT", "it"), area("97912", "IT", "it"),
            area("97911", "KR", "ko"));

    private IsbnAreas() {}

    /**
     * The area an ISBN-13 belongs to, if it is on the list. The ISBN system's codes are prefix-free (no code starts
     * another), so at most one area matches.
     */
    static Optional<Area> of(String isbn13) {
        return AREAS.stream().filter(area -> isbn13.startsWith(area.prefix())).findFirst();
    }

    /** Every area on the list, for the test that checks it. */
    static List<Area> all() {
        return AREAS;
    }

    private static Area area(String prefix, String country, String language) {
        return new Area(prefix, country, language);
    }
}
