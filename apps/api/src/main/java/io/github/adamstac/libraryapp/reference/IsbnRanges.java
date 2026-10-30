package io.github.adamstac.libraryapp.reference;

import java.util.Optional;

/**
 * What other modules may ask about ISBN ranges (ADR 0010). They never read the tables directly; Spring Modulith's test
 * fails the build if they try.
 */
public interface IsbnRanges {

    /**
     * The start of an ISBN-13 that names its publisher: 978 or 979, the country or language code, and the publisher's
     * code (for example 9789933685). Two ISBNs that start with it come from the same publisher. Empty when the ranges
     * haven't been imported, or when the ISBN falls in a range the Agency hasn't given out.
     *
     * @param isbn13 thirteen digits with a correct check digit, already checked by the caller
     */
    Optional<String> publisherPrefix(String isbn13);
}
