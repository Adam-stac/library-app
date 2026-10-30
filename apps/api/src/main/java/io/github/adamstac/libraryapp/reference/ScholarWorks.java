package io.github.adamstac.libraryapp.reference;

import java.util.List;

/**
 * What other modules may ask about classical scholars and their works (ADR 0010, layer 2): reference data from
 * Wikidata (CC0), the same for every reader, read-only.
 */
public interface ScholarWorks {

    /**
     * A scholar by their Wikidata ID (such as Q9546). The Hijri year is given only when Wikidata knew the date to the
     * month; the CE year whenever it knew the year.
     */
    record Scholar(String id, String nameAr, String nameEn, Integer deathHijri, Integer deathCe) {}

    /** A work with its authors, in the order the book names them. */
    record Work(String id, String titleAr, String titleEn, List<Scholar> authors) {}

    /**
     * Works whose titles or authors' names contain the text, matched the Arabic-aware way (V16) and forgiving of a
     * typo or a variant spelling; whole matches first. The text is matched literally: % and _ are not wildcards.
     */
    List<Work> search(String text, int limit);
}
