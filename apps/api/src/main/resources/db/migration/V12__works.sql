-- Works (ADR 0006, ADR 0007): the text itself, such as Sahih al-Bukhari, apart from any printed edition. A work
-- has a title in Arabic and/or English, at most one of the owner's sciences, and an ordered list of the owner's
-- authors (none for an anonymous work). The API checks that the science and the authors belong to the work's
-- owner. Every limit here is also checked by the API, so these CHECKs are a second line of defence.
--
-- Links between library records (a work's science and authors, an author's places) are checked when the
-- transaction commits (DEFERRABLE INITIALLY DEFERRED), not after each statement. Deleting an account deletes all
-- of its records in one go, in whatever order Postgres follows the cascades, and only the end result matters.
-- A record still in use still can't be deleted: the API refuses first (409 in_use), and the database refuses at
-- commit if the API ever didn't.
CREATE TABLE works (
    id         uuid        PRIMARY KEY,
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title_ar   text        CHECK (char_length(title_ar) BETWEEN 1 AND 500),
    title_en   text        CHECK (char_length(title_en) BETWEEN 1 AND 500),
    science_id uuid        REFERENCES sciences (id) DEFERRABLE INITIALLY DEFERRED,
    version    integer     NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT works_title_given CHECK (title_ar IS NOT NULL OR title_en IS NOT NULL)
);

CREATE INDEX works_owner_idx ON works (owner_id);
CREATE INDEX works_science_idx ON works (science_id) WHERE science_id IS NOT NULL;

-- A work's authors, in the order they are named
CREATE TABLE work_authors (
    work_id   uuid     NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    author_id uuid     NOT NULL REFERENCES authors (id) DEFERRABLE INITIALLY DEFERRED,
    position  smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
    PRIMARY KEY (work_id, author_id),
    CONSTRAINT work_authors_position_key UNIQUE (work_id, position)
);

CREATE INDEX work_authors_author_idx ON work_authors (author_id);

-- An author's places (V10), checked the same way
ALTER TABLE authors ALTER CONSTRAINT authors_birth_place_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE authors ALTER CONSTRAINT authors_death_place_id_fkey DEFERRABLE INITIALLY DEFERRED;
