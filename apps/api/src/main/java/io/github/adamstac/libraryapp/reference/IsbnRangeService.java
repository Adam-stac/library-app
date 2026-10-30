package io.github.adamstac.libraryapp.reference;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Splits an ISBN-13 with the imported ranges. The Agency's rules work on the seven digits after a prefix: the rule
 * whose range holds them gives the length of the code that comes next. First for 978 or 979 (the length of the
 * country or language code), then for that group (the length of the publisher's code).
 */
@Service
class IsbnRangeService implements IsbnRanges {

    /** The Agency's ranges are on seven digits. */
    static final int RANGE_DIGITS = 7;

    private final JdbcClient jdbc;

    IsbnRangeService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> publisherPrefix(String isbn13) {
        if (isbn13 == null || !isbn13.matches("97[89][0-9]{10}")) {
            return Optional.empty();
        }
        String ean = isbn13.substring(0, 3);
        Optional<Integer> groupLength = codeLength(ean, isbn13);
        if (groupLength.isEmpty()) {
            return Optional.empty();
        }
        String group = isbn13.substring(0, 3 + groupLength.get());
        Optional<Integer> publisherLength = codeLength(group, isbn13);
        // The publisher's code must leave at least one digit for the title, before the check digit
        return publisherLength
                .map(length -> group.length() + length)
                .filter(end -> end <= 11)
                .map(end -> isbn13.substring(0, end));
    }

    /** The length of the code after this prefix, or empty when no rule covers it or its range isn't in use. */
    private Optional<Integer> codeLength(String prefix, String isbn13) {
        return jdbc.sql("SELECT length FROM isbn_ranges"
                        + " WHERE prefix = :prefix AND :digits BETWEEN range_from AND range_to")
                .param("prefix", prefix)
                .param("digits", sevenDigitsAfter(prefix, isbn13))
                .query(Integer.class)
                .optional()
                .filter(length -> length > 0);
    }

    /** The seven digits after the prefix, as the Agency's ranges count them: padded with zeros past the ISBN's end. */
    static int sevenDigitsAfter(String prefix, String isbn13) {
        String rest = isbn13.substring(prefix.length(), 12); // the check digit isn't part of any code
        String seven = (rest + "0000000").substring(0, RANGE_DIGITS);
        return Integer.parseInt(seven);
    }
}
