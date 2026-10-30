-- Classical scholars and their works from Wikidata (ADR 0010, layer 2, slice L3). Reference data: owned by nobody,
-- read by every signed-in account, written only by the API's loader from the snapshot that ships with it
-- (reference/wikidata-scholars.json.gz, CC0), whenever that snapshot's checksum differs from the one loaded. No
-- endpoint writes here.

-- Trigram matching, so a title typed with a typo or a variant spelling is still found. A trusted extension: the
-- database's owner may create it
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Which snapshot is loaded
CREATE TABLE reference_release (
    source    text        PRIMARY KEY CHECK (source IN ('wikidata-scholars')),
    retrieved date        NOT NULL,
    sha256    text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    scholars  integer     NOT NULL CHECK (scholars >= 0),
    works     integer     NOT NULL CHECK (works >= 0),
    loaded_at timestamptz NOT NULL DEFAULT now()
);

-- A scholar, by their Wikidata ID (such as Q9546). Death years as in the authors table: a Hijri year only when the
-- date was known to the month, since one CE year spans two Hijri years
CREATE TABLE reference_scholars (
    id               text    PRIMARY KEY CHECK (id ~ '^Q[1-9][0-9]{0,11}$'),
    name_ar          text    CHECK (char_length(name_ar) BETWEEN 1 AND 300),
    name_en          text    CHECK (char_length(name_en) BETWEEN 1 AND 300),
    death_year_ce    integer CHECK (death_year_ce BETWEEN -1500 AND 2100 AND death_year_ce <> 0),
    death_year_hijri integer CHECK (death_year_hijri BETWEEN 1 AND 1500),
    CONSTRAINT reference_scholars_named CHECK (name_ar IS NOT NULL OR name_en IS NOT NULL)
);

-- A work, with its Arabic title. search_text is the titles and the authors' names, put together by the loader, so a
-- search for "البخاري صحيح" finds the book
CREATE TABLE reference_works (
    id          text PRIMARY KEY CHECK (id ~ '^Q[1-9][0-9]{0,11}$'),
    title_ar    text NOT NULL CHECK (char_length(title_ar) BETWEEN 1 AND 500),
    title_en    text CHECK (char_length(title_en) BETWEEN 1 AND 500),
    search_text text NOT NULL CHECK (char_length(search_text) <= 6000),
    search_key  text GENERATED ALWAYS AS (library_search_key(search_text)) STORED,
    sort_key    text GENERATED ALWAYS AS (library_sort_key(title_ar)) STORED
);

CREATE INDEX reference_works_search_idx ON reference_works USING gin (search_key gin_trgm_ops);

-- A work's authors in the order the book names them
CREATE TABLE reference_work_authors (
    work_id    text     NOT NULL REFERENCES reference_works (id) ON DELETE CASCADE,
    scholar_id text     NOT NULL REFERENCES reference_scholars (id) ON DELETE CASCADE,
    position   smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
    PRIMARY KEY (work_id, scholar_id),
    UNIQUE (work_id, position)
);

CREATE INDEX reference_work_authors_scholar_idx ON reference_work_authors (scholar_id);
