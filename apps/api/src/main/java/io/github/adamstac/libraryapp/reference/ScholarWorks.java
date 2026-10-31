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

    /**
     * Scholars whose names contain the text, matched the same way as {@link #search} (Arabic-aware, forgiving of a typo,
     * whole matches first), for a book whose title isn't in the catalogue but whose author may be.
     */
    List<Scholar> searchScholars(String text, int limit);

    /** A scholar on the general timeline: when they died, and how many of their works are in the catalogue. */
    record DatedScholar(String id, String nameAr, String nameEn, Integer deathHijri, Integer deathCe, int works) {}

    /** Every scholar whose year of death is known, for the general timeline; the same for every reader. */
    List<DatedScholar> dated();

    /**
     * A scholar's works in the catalogue, at most {@code limit}, each title once. Oldest Wikidata entry first, which
     * puts a scholar's best-known works first (صحيح البخاري before his other books).
     */
    List<Work> byScholar(String scholarId, int limit);
}
