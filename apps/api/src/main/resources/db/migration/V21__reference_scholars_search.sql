-- Finding a scholar by name, for the author field of the book form (ADR 0010, layer 2): when a book's title isn't in
-- the catalogue, its author usually is. Worked out from the names the same Arabic-aware way as the works' search key,
-- and indexed by trigrams so a typo or a variant spelling is still found.
ALTER TABLE reference_scholars
    ADD COLUMN search_key text GENERATED ALWAYS AS (
        library_search_key(coalesce(name_ar, '') || ' ' || coalesce(name_en, ''))) STORED;

CREATE INDEX reference_scholars_search_idx ON reference_scholars USING gin (search_key gin_trgm_ops);
