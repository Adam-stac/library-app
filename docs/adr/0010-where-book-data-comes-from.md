# 0010. Where book data comes from, and what is shared

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

ADR 0003 decided that readers enter their own library data, with an optional "look up by ISBN" that would fill the
form from Open Library and Google Books. Since then the plan has grown (Phase B3): scan a barcode or type an ISBN and
fill as many fields as possible, find classical works and authors by title, show a general timeline of scholars, and
perhaps one day share public book facts between readers.

Three things pull against each other:

- **Coverage.** Free ISBN databases cover Arabic books poorly. The test book (an Arabic edition from Dar al-Ghawthani,
  ISBN 9789933685119) is not found in them, and Arab national libraries offer no API. One source will never be enough,
  so the answer has to come in layers.
- **Licences.** Each source has its own terms. Some allow a copy to be kept, some forbid it, some say nothing we could
  find. A source that can't be kept must not end up in a table.
- **Privacy.** A lookup tells someone outside the app what a reader owns or is reading, and a library of religious
  books can reveal religion, which UK GDPR treats as special category data. Sharing facts between readers has the
  same risk in another form: a rare book found by probing points to the one person who owns it.

## Decision

**1. Fill in layers, nearest and most trusted first.** Each layer fills only the fields still empty, so an earlier
layer wins and nothing the reader typed is ever replaced.

| Layer | Slice | What it is | Leaves our servers? |
| --- | --- | --- | --- |
| 1. Your own library | L1, L2 | "You already have this"; publisher and place from the ISBN's publisher code and your own books; language from the country block | No |
| 2. Imported classical data | L3, T2 | Wikidata's classical scholars and their works (CC0), chosen in L3 after Usul's data was withdrawn | No |
| 3. Imported library records | L4 | Arabic-language records from Harvard (CC0) and the Library of Congress, after measuring coverage | No |
| 4. Shared reader catalogue | L6 | Public facts of a book, shared between readers, if it is ever built (point 7) | No |
| 5. Live fallbacks | L5 | BnF, Open Library, Google Books, asked from the server | **Yes** |

Layers 1 to 4 are searched on our own database, so they can answer as you type. Layer 5 is the only one that sends
anything out, and it is last. The order is by trust, then cost: catalogued records come before what readers entered
themselves, and anything that leaves the server comes after everything that doesn't. The slices are built in a
different order (the roadmap's), because the shared catalogue needs the most care.

**2. Suggestions, never records.** Nothing is saved until the reader has looked at it and pressed Save (as in
ADR 0003). Every field filled from outside the reader's own typing shows the ⓘ note, "may be incorrect, please check",
until the reader edits it. The note names where the value came from. The source is not stored: once saved, the entry
is the reader's own. An ISBN is matched exactly (after its check digit passes); a near match fills nothing.

**3. Reference data and personal data stay apart.**

- *Reference data* is facts about published books and scholars that belong to nobody: the Wikidata, ISBN-range and library-record
  imports. It lives in tables with no owner, readable by every signed-in account and writable by no endpoint (as the
  shared list of places is). It is not personal data.
- *Personal data* is everything a reader enters, scoped to its owner as in ADR 0006. In L1 to L5 none of it is ever
  copied into reference data or shown to another account.

**4. Imports are offline, pinned and checked.** Reference data is never fetched while the app is running. An
administrator runs an import command (not a Flyway migration: the data is large and changes more often than the
schema) against a named release and a recorded checksum. The import validates every field with the same rules as
reader input (NFC, no control or direction characters, length limits), loads in one transaction, and reports counts.
Running it again replaces the earlier snapshot. The licence notice travels with the data, and an "About the data"
page credits every source in use.

*Amended in L3 (30 October 2026):* data whose licence allows republishing (CC0, such as Wikidata) may instead ship
with the app as a snapshot in the repository, made by a script kept beside it (`tools/wikidata/`). Its SHA-256 is
pinned in the code, so only the snapshot reviewed in a pull request can load; the API loads it when it starts, only if
that checksum isn't already loaded, checking every value like reader input, in one transaction. Nothing is fetched
while the app runs. Data whose licence forbids republishing (the ISBN Agency's ranges) keeps the administrator's
import.

**5. Live lookups are narrow, on request, and from the server only.**

- The browser never contacts a catalogue. The Content Security Policy keeps `connect-src 'self'`; third-party cover
  images are not used either (they would leak the reader's address and break `img-src`).
- A lookup runs only when the reader presses "Search online", never per keystroke. What is sent is only the checked
  ISBN, or the title or author words the reader typed. A line beside the button says that this goes to the named
  services.
- Nothing about the account is sent: no ID, email, cookie or session. The request carries a fixed User-Agent naming
  the app and the administrator's contact (Open Library asks for this), never the reader's.
- Hosts come from a fixed list, over HTTPS with certificate checks. The server builds every address itself from a fixed
  host and encoded parameters. It follows no redirects, fetches no address found in a response, and refuses a listed
  host that resolves to a private, loopback or link-local address.
- The call has a timeout (about 3 seconds in all, sources asked in parallel), a response size limit, and runs outside
  any database transaction. XML is parsed with no DTD and no external entities.
- Each source is validated field by field like reader input. A bad field is dropped and the rest is kept. A source
  that fails or times out is skipped, the others still answer, and the reader sees "couldn't check online" at worst,
  never an error page.
- Lookups are `POST` with the CSRF token (they spend the account's allowance and cause outside calls), limited per
  account, and kept within each host's own published limits (Open Library: 1 request a second, 3 with an identifying
  User-Agent). A source that keeps failing is skipped for a while. Each source can be switched off by configuration.
- Answers may be remembered, shared across accounts and keyed by ISBN, holding public book facts only, never who
  asked, and only for a source whose terms allow it and no longer than they allow. Misses expire sooner than hits.

**6. What each source allows** (read on 30 October 2026 from the source's own pages; summaries, not legal advice;
re-read before go-live, which the go-live checklist now says):

| Source | Terms found | What we do |
| --- | --- | --- |
| Wikidata | CC0 1.0: no rights reserved, any use, no credit required. Read on 30 October 2026 | The source for L3 and T2: classical scholars linked to OpenITI (P13870) or al-Maktaba al-Shamela (P12435), and their works. A snapshot ships in the repository (point 4, amended). Credited on the About page all the same |
| Usul data | MIT: use, change and share, including commercially, if the licence and copyright notice are kept. Credits OpenITI and Turath.io (Shamela data). **Withdrawn:** on 30 October 2026 its repository (seemorg/usul-data) and Usul's own app repository were no longer public | Not used. A copy obtained from Usul with its licence would still be usable; a copy from an unofficial mirror would not, as it can't be shown to be unaltered. Was: import (L3, T2). Keep the notice; credit all three on the About page |
| ISBN Agency range file | Offered by the International ISBN Agency for use from its own site; its page says the material must not be republished without written permission, and it licenses no one to reproduce the file. Read on 30 October 2026 | Used, never republished: the administrator downloads it and imports it into the database (L2, `docs/operations/isbn-ranges.md`); it is never in this public repository, which ignores its usual file names. Tests use a made-up sample. The ISBN country codes behind the language suggestion are a short hand-made list of public facts, not a copy of the file |
| OpenITI directly | Its releases are CC BY-NC-SA 4.0 (Zenodo, read 30 October 2026); the daily metadata repository states no licence | Not imported: no commercial use and share-alike duties. Used only as a yardstick for Wikidata's coverage in L3 |
| al-Maktaba al-Shamela, and Turath (built on it) | Shamela's terms give no right to reuse content beyond its service and forbid rebuilding its index; Turath states "all rights reserved". Copies on Hugging Face are re-uploads whose labels their uploaders can't grant (read 30 October 2026) | Not imported. Linking to their pages is fine. Written permission from either would be recorded here |
| Harvard Library | CC0 with community norms (not binding): credit Harvard Library, OCLC and the Library of Congress where feasible; share improvements on the same terms. WorldCat records follow the WorldCat Rights and Responsibilities; study and research use fits, other uses need a review | Import the Arabic subset in L4 (the full set is 12.7 million records, which we neither need nor want). Credit them. Review the WorldCat terms before shipping |
| Library of Congress | Not yet checked | Check the terms in L4 before importing |
| Open Library | No licence stated on the developer pages we read. Asks that the API is not used for bulk downloads (use the monthly dumps), that requests are cached, and that the app identifies itself | Live single lookups only, cached, identified. Dumps are an L4 question, after reading their licensing and terms |
| BnF (SRU) | Open without sign-in, supports ISBN search. Licence and limits not stated on the pages we read | Live fallback only. Confirm licence and limits before L5 ships |
| Google Books | The Books terms say the app may not charge users without Google's agreement; the Google API terms bar building databases or permanent copies of content and limit caching to the cache header | Last fallback, off by default, never stored in a reference table or the shared catalogue, cached only as the header allows. **Review before the app charges anyone** (the roadmap expects paying readers one day) |

**7. What may be shared between readers (the boundary for L6, whose own ADR and threat model decide the rest).**
Only the public facts of a published book, keyed by ISBN: title, subtitle, authors and muhaqqiq as printed,
publisher, place, year, edition statement, volumes and language. Never:

- who contributed it, or when, or how many readers have it;
- a reader's shelf as a set, reading state, dates, prices, bookmarks, benefits, notes or sciences (a science is the
  reader's own classification);
- anything that makes a record appear because one reader added it.

A record appears for other readers only when several different accounts have entered matching facts (the number is
set in L6), so probing an ISBN can't point to one owner. Contributions come only from a saved, reviewed entry, in the
public fields only.

**8. Scanning (L1) happens on the device.** The barcode is decoded in the browser by code we ship, not by a service.
The picture never leaves the device; only the digits are used, and only if they are an ISBN (EAN-13 starting 978 or
979 with a correct check digit; a five-digit price add-on is ignored). The camera is asked for only when the reader
presses Scan, and it is switched off on leaving, closing or hiding the page. `Permissions-Policy` changes from
`camera=()` to `camera=(self)`; microphone, geolocation and payment stay off. Typing an ISBN works the same way and
needs no camera. "You already have this" is a check against the reader's own editions through our API, never a lookup
elsewhere.

## Alternatives considered

- **Live services only, no imports:** poor Arabic coverage, a privacy leak on every lookup, slow, rate-limited, and
  dependent on terms that can change. Kept as the last layer only.
- **Scraping publishers, library sites, Shamela, Goodreads or WorldCat:** fragile and against most terms.
- **Calling the services from the browser:** shows the reader's address to each service and would need a wider CSP.
- **Filling the book in automatically, with no review:** the data is often wrong for this kind of book (ADR 0003).
- **A shared catalogue from the start, or readers' libraries public by default:** reveals religion and exposes one
  reader's mistakes, or one reader's rare book, to everyone.
- **Never sharing anything between readers:** the safest choice, but coverage of Arabic editions would only ever grow
  by what the administrator imports. L6 stays optional and bounded by point 7.
- **A paid ISBN data service:** costs money, and such terms often forbid keeping the data. It can be revisited if the
  layers above prove too thin.
- **Importing OpenITI directly instead of Usul:** larger and more work; Usul already carries the metadata we need as
  JSON, under MIT. (Superseded in L3: Usul's data was withdrawn, and OpenITI is non-commercial and share-alike, so
  Wikidata was chosen. Wikidata covered 712 of OpenITI's 3,386 authors through its OpenITI IDs, nearly all of those
  who died by 300 AH, and reaches later scholars through its Shamela IDs: 1,723 people in all. Writers who weren't Muslims were left out on 30
  October 2026, as the timelines are of Muslim scholars: Western writers whose books Shamela carries in translation,
  and Christian, Jewish and other writers. That leaves 1,692 scholars; the 31 left out, and how they were found, are
  listed in `tools/wikidata/scholars_snapshot.py`.)

## Consequences

- The core app still works with no outside dependency. Every layer beyond the reader's own library is optional, and
  the live ones can be switched off.
- The first outbound calls made on a reader's behalf (apart from the password check and email) exist from L5. They
  have their own threat model, `docs/security/threat-models/book-lookup.md`, and the feature checklist's rules for
  outside services apply: timeouts, safe failure, no side effects inside a transaction.
- Reference tables add data and a duty: someone runs the imports and keeps the licence notices. Each import slice
  writes down how, and how often.
- A page crediting the sources is part of L3 and every later import.
- ADR 0003's lookup paragraph is replaced by this one (its status says so). Its other decisions stand.
- If a bundled barcode decoder needs WebAssembly, the CSP would need `'wasm-unsafe-eval'`. L1 decides that, with the
  smallest scope it can.
- T2 matches a reader's author to a scholar by an optional plain Wikidata ID on the author (no foreign key, so a new
  snapshot can't break a reader's records), set when the author is added from the timeline; one author per scholar in
  each account. Authors added before T2 are matched by name and year of death instead, so a scholar isn't shown twice.
- T3 shows the same list on the landing page, to anyone, from one public endpoint (`/api/v1/public/scholars`): CC0
  reference data only, rate-limited per address, kept by the visitor's browser. A scholar's works stay for signed-in
  readers.
- Left for later slices: mapping a suggested science to one in the reader's own list by name, and the numbers for limits and the
  agreement count in L6.
