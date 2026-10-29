-- The bin (ADR 0009): a deleted book or benefit is kept here for 30 days, so a slip can be undone, and is then
-- deleted for good by a daily job. The record is copied as it was (its own row, as JSON), and taken out of its
-- table, so every other query stays as it is and nothing in the bin is ever listed, searched or counted.
--
-- `related` keeps what went with it and is needed to put it back as it was: for a book, its bookmark, the IDs of
-- the benefits that named it, and its work (with the work's authors) when the book was the work's last copy.
--
-- Only the API writes here, never from request bodies; deleting the account deletes the bin with everything else.
CREATE TABLE bin (
    id         uuid        PRIMARY KEY, -- the deleted record's own ID, so putting it back keeps every link to it
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text        NOT NULL CHECK (kind IN ('book', 'benefit')),
    record     jsonb       NOT NULL,
    related    jsonb       NOT NULL DEFAULT '{}',
    deleted_at timestamptz NOT NULL DEFAULT now()
);

-- Newest first for the bin page; oldest first for the daily clear-out
CREATE INDEX bin_owner_deleted_idx ON bin (owner_id, deleted_at DESC);
CREATE INDEX bin_deleted_idx ON bin (deleted_at);
