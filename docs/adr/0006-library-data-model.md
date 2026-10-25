# 0006. Library data model: authors, places, works and editions

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

Feature 1 (accounts) is complete. Feature 2 is the library itself: the authors, places and books a
user enters from the physical books on their shelf (ADR 0003). The modules were named in ADR 0002:
`authors`, `places` and `library`.

The books are mostly classical Islamic works. Their dates are given in the Hijri calendar, often
"about" a year, and one work (for example *Sahih al-Bukhari*) exists in many printed editions, each
with its own muhaqqiq, publisher and ISBN. Some users rely mainly on English translations, which
give dates in CE and may have no Arabic title on the cover.

## Decision

### Ownership

- Every author, work and edition, and every place a user adds, has an `owner_id` that references
  `users(id)` with `ON DELETE CASCADE`. Deleting an account deletes its library in the same
  transaction, as it already does for everything else.
- Every query is scoped to the signed-in user. Another user's record answers **404**, exactly like
  a record that doesn't exist, so IDs can't be probed.
- IDs are random UUIDs. `owner_id`, `id` and `version` are never read from a request body.
- Whenever a request refers to another record (a work's authors, an author's birthplace, an
  edition's work), the API checks that the signed-in user may use that record, not only the record
  in the URL.

### Authors (`authors` module)

- **Names:** the name the author is known by, in Arabic and in English (at least one is required),
  and optionally the full name, ism, kunya, laqab and nisba.
- **Dates:** a birth year and a death year, each optional:
  - the **Hijri year** is the main entry. Years before the Hijra are stored as negative numbers and
    shown as "BH" (قبل الهجرة), since many Companions were born before it. There is no year 0;
  - an optional **CE year**, typed in when the user's book gives one (English translations usually
    do);
  - an **"approximate"** flag (تقريبًا) for each year, shown as "c. 300 AH" / "نحو ٣٠٠هـ".
- When the CE year is left blank, the web app shows the CE years that the Hijri year overlaps
  (256 AH → 869–870 CE), worked out with the standard tabular Islamic calendar (Julian calendar
  before 15 October 1582). A Hijri year usually spans two CE years, so a single CE year would be
  a guess; when it falls inside one CE year (48 of the years 1–1500 AH), that one year is shown.
  Nothing worked out is stored: the database holds only what the user entered.
- If both years are given in the same calendar, the death year can't be before the birth year.
- **Places:** an optional birthplace and death place, both links to places.
- **Biography:** plain text, at most 10,000 characters.

### Places (`places` module)

- A **shared starter list** of common historical places (Makkah, Madinah, Baghdad, Damascus, Kufa,
  Basra, Bukhara, Nishapur, Cordoba, Cairo and others) is loaded by a migration. Its rows have no
  owner, and nobody can change or delete them through the API.
- Users add their **own places** for anything missing. These belong to them like any other record.
- A place has a name in Arabic and in English (at least one), up to 10 other names, an optional
  modern country, and optional coordinates (for a map view later).
- Other modules ask the `places` module "may this user use this place?" through its public
  interface. They never read its tables directly, and Spring Modulith's test enforces that.

### Works and editions (`library` module)

- A **work** is the text itself: a title in Arabic and in English (at least one) and its authors
  (an ordered list of the user's own authors; zero is allowed for anonymous works).
- An **edition** is the book on the shelf. It belongs to one work and holds:
  - the title on the cover, if different from the work's;
  - the language of this edition, and the translator if it is a translation;
  - the muhaqqiq (typed in as text for now), the publisher and the place of publication (text,
    since publishers are in modern cities, not the historical places list);
  - the year of publication in Hijri and/or CE, as printed (Arabic prints often give both);
  - the edition number (الطبعة) and the number of volumes;
  - an **ISBN**, validated with the ISBN-10 or ISBN-13 check digit. Input may use Western digits,
    Arabic-Indic digits (٠–٩) or Persian digits (۰–۹), with hyphens or spaces. Only the standard
    digits (and a final `X` for ISBN-10) are stored;
  - a **legal deposit number** (رقم الإيداع): digits, `/`, `-` and spaces only;
  - where it is kept (shelf), and notes (plain text, at most 10,000 characters).
- A translation is an edition of the same work in another language, not a separate work. Links
  between different works (sharh, hashiya, mukhtasar) are a later slice.

### Rules that apply everywhere

- **Text:** trimmed and normalised to Unicode NFC. Not NFKC, because NFKC would expand ﷺ into the
  full phrase. Control characters are refused (newlines are allowed in biographies and notes), and
  so are the bidirectional embedding, override and isolate characters (U+202A–U+202E,
  U+2066–U+2069), which can make text display differently from what is stored.
- **Lengths:** every field has a maximum, enforced by the API and again by a database `CHECK`.
- **Limits per account:** 2,000 authors, 2,000 places, 10,000 works and 10,000 editions. The count
  is checked under a per-account transaction lock, so two requests at once can't pass the limit.
- **Lost updates:** every record has a `version`. An edit must send the version it started from; a
  stale one is refused with 409 (`stale_version`), so two devices can't silently overwrite each
  other.
- **Deleting:**
  - an author, or one of the user's own places, that is still in use is refused with 409
    (`in_use`), naming the records that use it;
  - deleting a work deletes its editions (the web page asks for a tick to confirm).
- **API:** under `/api/v1/` with standard methods: `GET` (lists are paged, at most 100 per page),
  `POST` to create, `PUT` to edit, `DELETE` to delete. CSRF is required on every write. The auth
  endpoints keep their existing POST-only style. Library requests have their own body-size limit
  and a per-account limit on writes.
- **Errors:** RFC 9457 problem details with a `code`, as in the rest of the API. Errors and logs
  never contain the text a user entered.

### Planned later (each needs its own threat model)

- Browse and search with Arabic-aware matching (ignoring tashkeel; أ/إ/آ as ا, ة as ه, ى as ي).
- Links between works (sharh, hashiya, mukhtasar).
- Export of the user's own library (JSON and CSV, protected against spreadsheet formulas).
- **Suggestions from outside sources**, reviewed by the user before anything fills the form:
  - "Look up by ISBN" for editions (ADR 0003);
  - "Look up this author" from scholarly databases such as OpenITI (whose author IDs include the
    Hijri death year) and Wikidata, with a link to the source of each suggestion. The user always
    picks from a list, because many scholars share a name. Whether an AI model may be used as a
    labelled fallback will be decided then.

## Acceptance criteria

A signed-in user **can**:

- add, view, edit and delete their own authors, works, editions and places, in Arabic or English;
- record dates in Hijri, optionally in CE, and mark them as approximate;
- pick a birthplace or death place from the shared list or their own places;
- record an edition's ISBN in any of the accepted digit forms, and its legal deposit number;
- see their data on any device, without one device's edit silently replacing another's.

A user **must never** be able to:

- see, change, delete, or even confirm the existence of another user's records;
- link their records to another user's author or place;
- change or delete a place on the shared list;
- set the owner or ID of a record;
- store markup or script that runs when the record is displayed;
- grow their library past the per-account limits, or send oversized requests.

## Alternatives considered

- **One "book" table:** simpler, but the same work would be typed in again for every edition, and
  linking a sharh to its matn would be impossible.
- **Works, editions and individual copies:** handles owning two copies of one edition, which is
  rare in a personal library; the extra level isn't worth it now.
- **Dates in CE only, or converting Hijri to a single CE year:** the sources give Hijri, and a
  single CE year is often wrong.
- **Shared authors across users:** rejected in ADR 0003 (whose data wins).
- **Places list only, with no user places:** users would be stuck when a place is missing.
- **POST-only endpoints, like the auth API:** standard methods are clearer for resources and easier
  for the mobile app; CSRF protection covers them the same way.
- **403 for another user's record:** reveals that the ID exists.

## Consequences

- Access control is the main risk, so every endpoint gets a cross-user test: a second user tries
  it on the first user's records and must get 404.
- A user's library can reveal their religious beliefs, which UK GDPR treats as special category
  data. It stays out of logs and error messages, and the privacy notice (go-live checklist) must
  cover it.
- Module boundaries stay clean: `authors` and `library` depend only on the public interfaces of
  `places` and `authors`.
- The external suggestion features can be added later without changing the tables, apart from
  recording where a suggested value came from.
