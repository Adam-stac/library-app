-- Authors (ADR 0006). Each belongs to one account; deleting the account deletes its authors.
-- Every limit here is also checked by the API, so these CHECKs are a second line of defence.
-- Hijri years before the Hijra are negative (BH), and CE years before year 1 are negative (BCE). No year 0.
CREATE TABLE authors (
    id                uuid        PRIMARY KEY,
    owner_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name_ar           text        CHECK (char_length(name_ar) BETWEEN 1 AND 200),
    name_en           text        CHECK (char_length(name_en) BETWEEN 1 AND 200),
    full_name         text        CHECK (char_length(full_name) BETWEEN 1 AND 500),
    ism               text        CHECK (char_length(ism) BETWEEN 1 AND 200),
    kunya             text        CHECK (char_length(kunya) BETWEEN 1 AND 200),
    laqab             text        CHECK (char_length(laqab) BETWEEN 1 AND 200),
    nisba             text        CHECK (char_length(nisba) BETWEEN 1 AND 200),
    birth_year_hijri  integer     CHECK (birth_year_hijri BETWEEN -2000 AND 1500 AND birth_year_hijri <> 0),
    birth_year_ce     integer     CHECK (birth_year_ce BETWEEN -1500 AND 2100 AND birth_year_ce <> 0),
    birth_approximate boolean     NOT NULL DEFAULT false,
    death_year_hijri  integer     CHECK (death_year_hijri BETWEEN -2000 AND 1500 AND death_year_hijri <> 0),
    death_year_ce     integer     CHECK (death_year_ce BETWEEN -1500 AND 2100 AND death_year_ce <> 0),
    death_approximate boolean     NOT NULL DEFAULT false,
    biography         text        CHECK (char_length(biography) BETWEEN 1 AND 10000),
    version           integer     NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT authors_name_given CHECK (name_ar IS NOT NULL OR name_en IS NOT NULL),
    CONSTRAINT authors_hijri_order CHECK (death_year_hijri >= birth_year_hijri),
    CONSTRAINT authors_ce_order CHECK (death_year_ce >= birth_year_ce)
);

CREATE INDEX authors_owner_idx ON authors (owner_id);
