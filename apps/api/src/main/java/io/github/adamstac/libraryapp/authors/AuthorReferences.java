package io.github.adamstac.libraryapp.authors;

import java.util.UUID;

/**
 * Implemented by each module whose records name authors (a work's authors), so that an author still in use isn't
 * deleted. The authors module finds every implementation without depending on those modules.
 */
public interface AuthorReferences {

    /** A short name for the kind of record, used as a key in the 409 in_use answer (e.g. "works"). */
    String kind();

    /** How many of the user's records name the author. */
    long countUsing(UUID ownerId, UUID authorId);
}
