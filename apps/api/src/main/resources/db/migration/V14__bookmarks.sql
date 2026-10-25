-- Bookmarks (ADR 0007): at most one per edition, saying where the reader is now (a page, and for a set, a
-- volume). Moving it replaces it, and the newest move wins. Deleting the edition or the account deletes it.
-- Every limit here is also checked by the API (which also checks the volume against the edition's number of
-- volumes, something a CHECK can't do).
CREATE TABLE bookmarks (
    edition_id uuid        PRIMARY KEY REFERENCES editions (id) ON DELETE CASCADE,
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    volume     integer     CHECK (volume BETWEEN 1 AND 500),
    page       integer     NOT NULL CHECK (page BETWEEN 1 AND 99999),
    moved_at   timestamptz NOT NULL DEFAULT now()
);

-- The most recently moved bookmarks come first on the home page
CREATE INDEX bookmarks_owner_moved_idx ON bookmarks (owner_id, moved_at DESC);
