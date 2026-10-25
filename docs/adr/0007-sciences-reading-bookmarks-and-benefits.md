# 0007. Sciences, reading dates, bookmarks and benefits

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

ADR 0006 covers the catalogue: authors, places, works and editions. The owner also wants the app to
help with reading, not only cataloguing:

- see which sciences (فنون) the library covers, ranked from most books to fewest;
- record when a book was bought and for how much, and when reading started and finished, to decide
  what to read next and to find books that were bought and forgotten;
- keep a bookmark (volume and page) for each book being read, so there is nothing to remember;
- save benefits (فوائد) from books, in the app now and through the Ḥāsib bot later.

The interface is built only after the whole backend works (roadmap), so this ADR fixes the data
model for slices 12 to 16 before any of them is built.

## Decision

All of this lives in the `library` module, next to works and editions (ADR 0002). Everything follows
the rules of ADR 0006: owned by one account (`ON DELETE CASCADE`), another user's record answers 404,
text trimmed and NFC-normalised with control and bidirectional characters refused, a limit on every
field in the API and in the database, per-account limits under a lock, a version in `ETag` and
`If-Match`, and errors that never repeat what was typed.

### Sciences (slice 12)

- Each account has **its own list of sciences**, which it can rename, delete and add to freely.
- A new account starts with a **starter list** (العقيدة، التفسير، الحديث، الفقه and others). The list is
  kept in a read-only table, `starter_sciences`, and copied into every new account by a database
  trigger on `users`, so every account gets it however it is created. Accounts that exist when the
  migration runs get it from the migration.
- A science has a name in Arabic and in English (at least one, each at most 100 characters). Two of
  the same account's sciences can't share a name (the English name ignoring case).
- The list is flat: no sub-sciences. "Ḥanbalī fiqh" can be its own science.
- At most 200 sciences per account. Lists are not paged: they return all of the account's sciences.
- A **work has at most one science** (set in slice 13). A science that a work still uses can't be
  deleted (409 `in_use`, with a count).

### Purchase and reading dates (slice 13)

Each **edition** (the copy on the shelf) can record:

- the date it was bought, and the price paid: an amount in minor units (pence, fils) with an ISO
  4217 currency code. Each account has a default currency, which the form fills in. Totals are
  given per currency and never converted;
- the date reading started and the date it finished. A finish date needs a start date and can't be
  before it. No date may be in the future (a day's leeway allows for time zones).

"Not started", "reading" and "finished" are worked out from the dates, never stored, so they can't
disagree with them.

### Bookmarks (slice 14)

- An edition has **at most one bookmark**: a page (1 to 99,999) and, for a set, a volume (1 to the
  number of volumes). Moving it replaces it. `PUT` and `DELETE` on `/api/v1/editions/{id}/bookmark`.
- The newest move wins, with no `If-Match`: a bookmark records where the reader is now, so the latest
  move is the right one. Each bookmark keeps when it was last moved.

### Benefits (slice 15)

- A benefit is plain text (1 to 5,000 characters, several lines allowed). It can name one of the
  account's editions, and a volume and page in it.
- Its **source** (`app`, or `hasib` later) is set by the server from how it arrived, never by the
  request, so a benefit can't pretend to come from somewhere else.
- At most 20,000 benefits per account. Lists are newest first and can be narrowed to one edition.
- Deleting an edition keeps its benefits and removes the link to it, because a benefit is worth
  keeping even if the copy is given away.

### Home summary and search (slice 16)

- **Library by science:** the number of the account's editions in each science (through the work),
  ranked from most to fewest, with percentages that add up to exactly 100 (largest remainder). A set
  of volumes counts as one book. Editions whose work has no science are shown as "no science".
- Counts of books, authors, reading and finished this year; books bought but not started; the most
  recently moved bookmarks; the newest benefits.
- Search across the account's own records, with Arabic-aware matching (ADR 0006).

## Alternatives considered

- **A shared, fixed list of sciences plus the user's own (like places):** the owner wants to shape the
  list; sciences are a personal way of arranging a library, unlike places, which are facts.
- **Copying the starter list when the account is created, in Java:** accounts created any other way
  (tests, a future import) would have no sciences. The trigger covers every way.
- **Sub-sciences:** more complicated percentages and forms for little gain in a personal library.
- **A science on each edition:** two copies of the same work could then disagree.
- **Storing a reading status:** it could contradict the dates.
- **Bookmark history, or several bookmarks per book:** not needed now; can be added without changing
  the current table.
- **Converting prices to one currency:** needs exchange rates, which change and aren't the user's data.

## Consequences

- The `users` table has a trigger owned by the `library` module's migration. It is documented in the
  migration, and `deletingTheAccountRemovesItsSciences` covers the cascade.
- Every new account gets 13 rows. That is cheap, and it removes a special case from every
  screen: there is always a list to choose from.
- Benefits can reveal religious belief, like the rest of the library (ADR 0006): kept out of logs and
  error messages, and covered by the privacy notice.
- The Ḥāsib bot will add bookmarks and benefits through the same rules, with its own threat model
  (linking a messaging account to an app account is the main new risk).
