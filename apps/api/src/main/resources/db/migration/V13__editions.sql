-- Editions (ADR 0006, ADR 0007): the copies on the shelf. Each belongs to one of the owner's works (deleting the
-- work deletes its editions) and records the imprint, where it is kept, when it was bought and for how much, and
-- when reading started and finished. "Not started", "reading" and "finished" are worked out from the dates and
-- never stored. Every limit here is also checked by the API, so these CHECKs are a second line of defence.
-- (The API also refuses dates in the future, which a CHECK can't do.)
CREATE TABLE editions (
    id                uuid        PRIMARY KEY,
    owner_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    work_id           uuid        NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    title             text        CHECK (char_length(title) BETWEEN 1 AND 500), -- the cover title, if different
    language          text        CHECK (language ~ '^[a-z]{2}$'), -- ISO 639-1, e.g. ar, en, ur
    translator        text        CHECK (char_length(translator) BETWEEN 1 AND 200),
    muhaqqiq          text        CHECK (char_length(muhaqqiq) BETWEEN 1 AND 300),
    publisher         text        CHECK (char_length(publisher) BETWEEN 1 AND 200),
    publication_place text        CHECK (char_length(publication_place) BETWEEN 1 AND 200),
    published_hijri   integer     CHECK (published_hijri BETWEEN 1 AND 1500),
    published_ce      integer     CHECK (published_ce BETWEEN 1 AND 2100),
    edition_number    integer     CHECK (edition_number BETWEEN 1 AND 999), -- الطبعة
    volumes           integer     CHECK (volumes BETWEEN 1 AND 500),
    isbn              text        CHECK (isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'), -- digits only, check digit tested by the API
    legal_deposit     text        CHECK (char_length(legal_deposit) <= 50 AND legal_deposit ~ '^[0-9/ -]*[0-9][0-9/ -]*$'),
    shelf             text        CHECK (char_length(shelf) BETWEEN 1 AND 100),
    notes             text        CHECK (char_length(notes) BETWEEN 1 AND 10000),
    purchased_on      date        CHECK (purchased_on >= DATE '1900-01-01'),
    price_minor       bigint      CHECK (price_minor BETWEEN 0 AND 1000000000000), -- pence, fils, cents
    price_currency    text        CHECK (price_currency ~ '^[A-Z]{3}$'), -- ISO 4217
    started_on        date        CHECK (started_on >= DATE '1900-01-01'),
    finished_on       date,
    version           integer     NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT editions_price_together CHECK ((price_minor IS NULL) = (price_currency IS NULL)),
    CONSTRAINT editions_finished_after_started
        CHECK (finished_on IS NULL OR (started_on IS NOT NULL AND finished_on >= started_on))
);

CREATE INDEX editions_owner_idx ON editions (owner_id);
CREATE INDEX editions_work_idx ON editions (work_id);

-- Each account's library settings; for now, the currency the edition form fills in
CREATE TABLE library_settings (
    owner_id         uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    default_currency text        CHECK (default_currency ~ '^[A-Z]{3}$'),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
