-- Reading a book's title page from a photo (ADR 0011): one row per reading asked for, so the limits per account (a day,
-- a month) and for the whole app (a month) can be kept. Neither the photo nor anything read from it is stored here or
-- anywhere: only who asked, when, and how it went. Rows older than two months are deleted as new ones are added.
CREATE TABLE page_readings (
    id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at  timestamptz NOT NULL DEFAULT now(),
    outcome  text        NOT NULL CHECK (outcome IN ('pending', 'read', 'nothing_read', 'unavailable', 'timed_out'))
);

CREATE INDEX page_readings_owner_idx ON page_readings (owner_id, read_at);
CREATE INDEX page_readings_read_at_idx ON page_readings (read_at);
