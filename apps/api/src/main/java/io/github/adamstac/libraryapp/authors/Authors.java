package io.github.adamstac.libraryapp.authors;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What other modules may ask the authors module (ADR 0006). They never read its tables directly; Spring Modulith's
 * test fails the build if they try. Authors are never shared: a user may only use their own.
 */
public interface Authors {

    /** How an author is named when another record refers to them. */
    record AuthorName(UUID id, String nameAr, String nameEn) {}

    /**
     * Whether the author is one of the user's own. Must be called inside the transaction that stores the reference:
     * the author is then locked against deletion until that transaction ends.
     */
    boolean usableBy(UUID ownerId, UUID authorId);

    /** The names of the user's authors, by ID; IDs that aren't the user's are left out. */
    Map<UUID, AuthorName> names(UUID ownerId, Collection<UUID> authorIds);

    /** Search results: the first few, in name order, and how many there are in all. */
    record Found(List<AuthorName> items, long total) {}

    /**
     * The user's authors whose names contain the search text, matched the Arabic-aware way (V16). The text is
     * matched literally: % and _ are not wildcards.
     */
    Found search(UUID ownerId, String text, int limit);
}
