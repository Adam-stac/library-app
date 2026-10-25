package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.authors.AuthorReferences;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Tells the authors module how many of a user's works name an author, so the author isn't deleted. */
@Component
class WorkAuthorReferences implements AuthorReferences {

    private final JdbcClient jdbc;

    WorkAuthorReferences(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String kind() {
        return "works";
    }

    @Override
    public long countUsing(UUID ownerId, UUID authorId) {
        return jdbc.sql("""
                        SELECT count(*) FROM work_authors JOIN works ON works.id = work_authors.work_id
                        WHERE works.owner_id = :owner AND work_authors.author_id = :author
                        """)
                .param("owner", ownerId)
                .param("author", authorId)
                .query(Long.class)
                .single();
    }
}
