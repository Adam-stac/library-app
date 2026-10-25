package io.github.adamstac.libraryapp.authors;

import io.github.adamstac.libraryapp.places.PlaceReferences;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Tells the places module how many of a user's authors were born or died in a place, so it isn't deleted. */
@Component
class AuthorPlaceReferences implements PlaceReferences {

    private final JdbcClient jdbc;

    AuthorPlaceReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String kind() {
        return "authors";
    }

    @Override
    public long countUsing(UUID ownerId, UUID placeId) {
        return jdbc.sql("""
                        SELECT count(*) FROM authors
                        WHERE owner_id = :owner AND (birth_place_id = :place OR death_place_id = :place)
                        """)
                .param("owner", ownerId)
                .param("place", placeId)
                .query(Long.class)
                .single();
    }
}
