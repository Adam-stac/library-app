package io.github.adamstac.libraryapp.places;

import java.util.UUID;

/**
 * Implemented by each module whose records can refer to a place (authors' birth and death places), so that a
 * place still in use isn't deleted. The places module finds every implementation without depending on those
 * modules, which keeps the dependencies one way.
 */
public interface PlaceReferences {

    /** A short name for the kind of record, used as a key in the 409 in_use answer (e.g. "authors"). */
    String kind();

    /** How many of the user's records refer to the place. */
    long countUsing(UUID ownerId, UUID placeId);
}
