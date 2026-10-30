-- ISBN ranges (ADR 0010, reference data): where each ISBN's country or language area ends and its publisher's code
-- ends. The International ISBN Agency publishes them for use from its own site but not for republishing, so they
-- are never in the repository: the administrator downloads the file and runs the import command
-- (docs/operations/isbn-ranges.md). Until then these tables are empty and no publisher is suggested.
--
-- Owned by nobody, readable by the API for every signed-in account, and written only by the import, which replaces
-- the whole snapshot in one transaction. No endpoint writes here.

-- Which copy of the Agency's file is loaded
CREATE TABLE isbn_range_release (
    only_one     boolean     PRIMARY KEY DEFAULT true CHECK (only_one), -- one row at most
    serial       text        NOT NULL CHECK (char_length(serial) BETWEEN 1 AND 100),
    message_date text        NOT NULL CHECK (char_length(message_date) BETWEEN 1 AND 100),
    sha256       text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    group_count  integer     NOT NULL CHECK (group_count > 0),
    rule_count   integer     NOT NULL CHECK (rule_count > 0),
    imported_at  timestamptz NOT NULL DEFAULT now()
);

-- One rule of the file. The prefix is 978 or 979 (its rules give the length of the country or language code that
-- follows), or 978/979 and a group (its rules give the length of the publisher's code that follows, such as 9789933).
-- Ranges are on the next seven digits, as in the file; a length of 0 means the range isn't in use.
CREATE TABLE isbn_ranges (
    prefix     text     NOT NULL CHECK (prefix ~ '^97[89][0-9]{0,5}$'),
    range_from integer  NOT NULL CHECK (range_from BETWEEN 0 AND 9999999),
    range_to   integer  NOT NULL,
    length     smallint NOT NULL CHECK (length BETWEEN 0 AND 7),
    PRIMARY KEY (prefix, range_from),
    CONSTRAINT isbn_ranges_in_order CHECK (range_to BETWEEN range_from AND 9999999)
);
