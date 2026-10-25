-- Arabic-aware search and sorting (ADR 0006, ADR 0007). What the user typed is stored as typed; these keys are
-- only for finding and ordering. The same functions are used for the stored keys and for the search text, so
-- the two always match.

-- The text to search in: small letters; vowel marks (tashkīl) and the tatweel removed; أ إ آ ٱ as ا, ى as ي,
-- ة as ه, ؤ as و, ئ as ي; transliteration marks removed (Ḥadīth as hadith, ʿAqīdah as aqidah); Arabic-Indic and
-- Persian digits as 0-9; runs of spaces as one.
CREATE FUNCTION library_search_key(value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN btrim(regexp_replace(
        translate(
            regexp_replace(lower(value), '[ً-ٰٟـ]', '', 'g'),
            'أإآٱىةؤئāīūēōḥṣḍṭẓġḳṯḏḫšžáéíóú٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ʿʾ''’‘`ʻʼ',
            'اااايهويaiueohsdtzgktdhszaeiou01234567890123456789'),
        '\s+', ' ', 'g'));

-- The text to sort by: the search key without a leading article ("ال", "al-", "el-", "the ", "a ", "an "), as
-- library catalogues file titles. "ابن" and "أبو" stay, because they are part of the name.
CREATE FUNCTION library_sort_key(value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN regexp_replace(library_search_key(value), '^(ال|al-|al |el-|the |an |a )', '');

-- What a user searches for, as a LIKE pattern in which % and _ are ordinary characters, not wildcards
CREATE FUNCTION library_like_pattern(query text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN '%' || replace(replace(replace(library_search_key(query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

-- A place's other names as one text (array_to_string itself isn't marked immutable, but for text[] it is)
CREATE FUNCTION library_names_text(names text[]) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN coalesce(array_to_string(names, ' '), '');

-- Each searchable record keeps its search key, worked out by the database whenever the record changes
ALTER TABLE authors ADD COLUMN search_key text GENERATED ALWAYS AS (library_search_key(
    coalesce(name_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(full_name, '') || ' ' ||
    coalesce(ism, '') || ' ' || coalesce(kunya, '') || ' ' || coalesce(laqab, '') || ' ' || coalesce(nisba, ''))) STORED;

ALTER TABLE places ADD COLUMN search_key text GENERATED ALWAYS AS (library_search_key(
    coalesce(name_ar, '') || ' ' || coalesce(name_en, '') || ' ' || library_names_text(other_names) || ' ' ||
    coalesce(country_ar, '') || ' ' || coalesce(country_en, ''))) STORED;

ALTER TABLE works ADD COLUMN search_key text GENERATED ALWAYS AS (library_search_key(
    coalesce(title_ar, '') || ' ' || coalesce(title_en, ''))) STORED;

ALTER TABLE editions ADD COLUMN search_key text GENERATED ALWAYS AS (library_search_key(
    coalesce(title, '') || ' ' || coalesce(translator, '') || ' ' || coalesce(muhaqqiq, '') || ' ' ||
    coalesce(publisher, '') || ' ' || coalesce(isbn, ''))) STORED;

ALTER TABLE benefits ADD COLUMN search_key text GENERATED ALWAYS AS (library_search_key(body)) STORED;
