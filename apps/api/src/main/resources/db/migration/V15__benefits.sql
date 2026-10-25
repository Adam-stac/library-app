-- Benefits (فوائد, ADR 0007): plain text the owner wants to keep from their reading, optionally naming one of
-- their editions and a volume and page in it. The source (app now, the Ḥāsib bot later) is set by the server,
-- never by the request. Deleting the edition keeps the benefit and removes the link to it (the volume and page
-- stay, as a note of where it came from); deleting the account deletes everything. Every limit here is also
-- checked by the API.
CREATE TABLE benefits (
    id         uuid        PRIMARY KEY,
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    edition_id uuid        REFERENCES editions (id) ON DELETE SET NULL,
    volume     integer     CHECK (volume BETWEEN 1 AND 500),
    page       integer     CHECK (page BETWEEN 1 AND 99999),
    source     text        NOT NULL CHECK (source IN ('app', 'hasib')),
    version    integer     NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Newest first, for the whole library or for one edition
CREATE INDEX benefits_owner_created_idx ON benefits (owner_id, created_at DESC);
CREATE INDEX benefits_edition_idx ON benefits (edition_id) WHERE edition_id IS NOT NULL;
