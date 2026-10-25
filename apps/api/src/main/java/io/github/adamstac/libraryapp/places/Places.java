package io.github.adamstac.libraryapp.places;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What other modules may ask the places module (ADR 0006). They never read its tables directly; Spring Modulith's
 * test fails the build if they try. A place is usable by a user when it is one of their own or on the shared list.
 */
public interface Places {

    /** How a place is named when another record refers to it. */
    record PlaceName(UUID id, String nameAr, String nameEn) {}

    /**
     * Whether the user may refer to this place. Must be called inside the transaction that stores the reference:
     * the place is then locked against deletion until that transaction ends, so a reference can never point at a
     * place deleted at the same moment.
     */
    boolean usableBy(UUID ownerId, UUID placeId);

    /** The names of the places the user may use, by ID; IDs the user may not use are left out. */
    Map<UUID, PlaceName> names(UUID ownerId, Collection<UUID> placeIds);

    /** Search results: the first few, in name order, and how many there are in all. */
    record Found(List<PlaceName> items, long total) {}

    /**
     * The places the user may use (their own and the shared list) whose names contain the search text, matched
     * the Arabic-aware way (V16). The text is matched literally: % and _ are not wildcards.
     */
    Found search(UUID ownerId, String text, int limit);
}
