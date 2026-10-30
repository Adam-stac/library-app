-- An author can be linked to a scholar in the reference data by their Wikidata ID (ADR 0010, slice T2), so the
-- timeline shows them once, as the reader's own. A plain ID with no foreign key: a new snapshot without that scholar
-- can't break the reader's record. Set when an author is added from the scholars' catalogue or the timeline; editing
-- an author never removes it. One author per scholar per account.
ALTER TABLE authors ADD COLUMN wikidata_id text CHECK (wikidata_id ~ '^Q[1-9][0-9]{0,11}$');

CREATE UNIQUE INDEX authors_owner_wikidata_idx ON authors (owner_id, wikidata_id) WHERE wikidata_id IS NOT NULL;
