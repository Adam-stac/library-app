# Threat model: filling in books (barcode scan, ISBN and title lookup)

**Scope:** ADR 0010 and Phase B3, slices L1 to L5: scanning or typing an ISBN, "you already have this", suggestions
from the reader's own library, from imported reference data (Usul, then Harvard and Library of Congress records) and
from live services (BnF, Open Library, Google Books), the ⓘ check note, and the imports themselves. Test names marked
*(planned, slice N)* are written in that slice, and this file is updated as each slice is built. The lookup endpoints
are named in L1, L3 and L5, and each is added to the `LIBRARY` paths in `SecurityConfig` and to `SecurityBaselineTests`.
The shared reader catalogue (L6) is **not** covered here: ADR 0010 sets its boundary, and it gets its own ADR and
threat model before any code. The saved records are covered by `library.md`.
**ASVS 5.0 (Level 2) chapters:** V1 Encoding and Sanitization, V2 Validation and Business Logic, V3 Web Frontend
Security, V4 API and Web Service, V8 Authorization, V12 Secure Communication, V13 Configuration, V14 Data Protection,
V15 Secure Coding and Architecture, V16 Security Logging and Error Handling.
**Personal data:** what a reader types or scans to look something up (an ISBN, title words) can reveal what they own or
read, and so possibly their religion (special category data). It is used for the lookup, never stored for its own
sake, and never logged. The reference data is facts about published books and scholars, not personal data. A reader's
saved book is covered by `library.md`.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Using lookups without signing in | Every lookup endpoint needs a signed-in session; anything not listed in `SecurityConfig` is denied | `editionsAndSettingsNeedSignIn` and `SecurityBaselineTests` (slice L1, `GET /api/v1/editions/by-isbn`); `lookupNeedsSignIn` *(planned, slices L3, L5)* |
| Spoofing | A network attacker or a fake host pretends to be a catalogue | HTTPS only, certificates verified, a fixed list of hosts, no custom trust settings | `onlyHttpsAndTheListedHostsAreCalled`, `aBadCertificateIsRefused` *(planned, slice L5, against a fake server)* |
| Tampering | A malicious page makes the server call outside services for the reader | Lookups are `POST` and need the CSRF token | `lookupChangesNeedTheCsrfToken` *(planned, slices L3, L5)*. The L1 check is a `GET` that changes nothing and calls no outside service |
| Tampering | A hostile or broken response (script in a title, direction-control characters, huge text, wrong types, an XML bomb or external entity) | Responses are untrusted. XML is parsed with no DTD and no external entities; size limits; every field is checked like reader input (NFC, control and direction characters, length), and a bad field is dropped while the rest is kept. React shows it as text | `hostileResponsesAreDroppedFieldByField`, `xmlEntitiesAreNeverExpanded`, `oversizedResponsesAreCutOff` *(planned, slice L5)*; `scriptInASuggestedTitleIsShownAsText` *(planned, slice L2, web: the first slice that shows suggested text)* |
| Tampering | A wrong match is trusted and saved (the wrong book, a wrong publisher) | Nothing is saved until the reader presses Save. Every filled field shows the ⓘ "may be incorrect" note, naming its source, until it is edited. An ISBN must pass its check digit and match exactly; a near match fills nothing | `everyFilledFieldCarriesTheCheckNote` (per layer, web), `anIsbnThatDoesntMatchExactlyFillsNothing` *(planned, slices L2, L3, L5)* |
| Tampering | A suggestion overwrites what the reader already typed | Filling touches only empty fields | `fillingNeverReplacesWhatYouTyped` *(planned, slice L2, web)* |
| Tampering | An import brings in altered or hostile data (supply chain) | Imports are run by the administrator from a named release with a recorded checksum, never fetched while the app runs; every field validated; one transaction; counts reported; no endpoint writes reference data | `anImportWithTheWrongChecksumIsRefused`, `importedTextIsCheckedLikeReaderText`, `noEndpointWritesReferenceData` *(planned, slices L3, L4)* |
| Tampering | Mass assignment: sending `owner_id` or a source name in a lookup body | Lookup bodies are fixed records holding an ISBN or search text only; nothing else is read | `theIsbnCheckTakesNoOwnerOrOtherFieldsFromTheRequest` (slice L1); `ownerIdInTheBodyIsNeverUsed` *(planned, slices L3, L5)* |
| Tampering | A reader changes the shared reference data, or their own data leaks into it | Reference tables have no owner column and no write endpoint; personal data is never copied into them | `noEndpointWritesReferenceData`; ADR 0010 point 3 |
| Repudiation | A reader disputes what a lookup did | Low risk: a lookup changes nothing. The log records the source and the outcome (found, none, timeout, error) and a count, never the ISBN or the text | `lookupLogsNeverHoldWhatWasAsked` *(planned, slice L5)* |
| Information disclosure | A catalogue learns what a reader owns or is reading | Server-side only, so the browser never contacts a catalogue (`connect-src 'self'`; no third-party images). Lookups run only when the reader presses "Search online", never per keystroke, and the note beside the button says where it goes. Only the checked ISBN or the typed words are sent: no account ID, email, cookie or session, and a fixed User-Agent naming the app and the administrator. Each source can be switched off | `onlyTheIsbnOrTheTypedWordsAreSent` (a fake server records the request and its headers), `nothingIsSentUntilYouPressSearch` (web), `theBrowserNeverCallsACatalogue` (e2e records requests; CSP header test) *(planned, slice L5)* |
| Information disclosure | One reader learns what another has looked up (through a shared answer cache) | The cache holds public book facts keyed by ISBN, never who asked or when; a hit and a miss differ only in speed | Accepted risk, below |
| Information disclosure | Errors or logs repeat the ISBN, the text, a response or an API key | Errors return codes only (`source_unavailable`, `timed_out`, `not_found`); keys are read from the environment and never logged or sent to the browser | `errorsNeverEchoTheQueryOrTheResponse`, `theKeyIsNeverLoggedOrSentToTheBrowser` *(planned, slice L5)* |
| Information disclosure | "You already have this" tells a reader about another account's books | The check looks only at the signed-in reader's own editions | `youAlreadyHaveThisOnlyLooksAtYourOwnBooks`, `aBookInTheBinIsNotAlreadyYours`, `youAlreadyHaveThisNamesNoMoreThanFiveCopies`, `theIsbnCheckIsCheckedAndNeverEchoesWhatWasTyped` (slice L1) |
| Information disclosure | The camera picture leaves the device, or the camera stays on | The barcode is decoded in the browser by code we ship; only the digits are used. The camera is asked for only on pressing Scan, and switched off on leaving, closing or hiding the page. `Permissions-Policy` allows `camera=(self)` and nothing else new | slice L1: the scanner tests in `IsbnScanner.test.tsx` (the camera is asked for only on Scan; a found ISBN sends nothing anywhere; the camera is switched off on close, tab hidden, leaving the page, and a reader that fails to load), the e2e scan in `isbn.spec.ts`, and the header test "only our own pages may use the camera, and nothing else new is opened up" |
| Information disclosure | Using a source beyond its licence (copying what may not be copied) | The licence table in ADR 0010; a source whose terms forbid copies is never stored in a reference table or cached beyond its headers; credit on the About page; the terms are re-read before go-live | `theAboutPageCreditsEverySourceInUse` *(planned, slice L3, web)*; go-live checklist item |
| Denial of service | Flooding the lookups, and through them the catalogues (and getting our server blocked) | A limit per account, a limit per host that respects its published rules (Open Library: 1 a second, 3 with an identifying User-Agent), a short-lived skip for a source that keeps failing | `tooManyLookupsAreSlowedDown`, `theHostLimitsAreKept`, `aFailingSourceIsSkippedForAWhile` *(planned, slice L5)* |
| Denial of service | A slow or huge response ties up the server | About 3 seconds in all, sources asked in parallel, connect and read timeouts, a response size limit, no database transaction held open during a call | `aSlowSourceCantHoldTheAnswerPast3Seconds`, `slowResponsesAreCutOff`, `oversizedResponsesAreCutOff` *(planned, slice L5)* |
| Denial of service | Expensive title searches over reference data | Same rules as library search: `%` and `_` matched literally, text at most 100 characters and needing a letter or digit, at most 20 results, Arabic-aware keys worked out by the database, no regular expressions from the reader | `wildcardsInATitleSearchAreLiteral`, `theTitleSearchTextIsChecked` *(planned, slice L3)* |
| Denial of service | An import fills the disk | Each import has a size budget checked before loading; it replaces the earlier snapshot rather than adding to it | `anImportOverItsBudgetIsRefused` *(planned, slices L3, L4)* |
| Elevation of privilege | SSRF: making the server fetch an internal address (localhost, the Docker network, a cloud metadata address) | Every address is built by the server from a fixed host and encoded parameters. No address from the reader or from a response is ever fetched; redirects are not followed; a listed host that resolves to a private, loopback or link-local address is refused, and the connection uses the address that was checked | `noReaderSuppliedAddressIsEverFetched`, `redirectsAreNotFollowed`, `addressesInAResponseAreNeverFetched`, `aListedHostThatResolvesToAPrivateAddressIsRefused` *(planned, slice L5)* |
| Elevation of privilege | A bundled or loaded component (the barcode decoder, a parser) is compromised | The decoder is bundled with the app, never loaded from a CDN (`script-src 'self'`); versions are pinned and Dependabot watches them. If it needs WebAssembly the CSP change is as narrow as possible and decided in L1 | Decided in L1: `@zxing/library` 0.23.0 is pure JavaScript, bundled and loaded only on Scan, so no WebAssembly and no CSP change; the same header test checks `connect-src 'self'`; a size budget in CI; existing CI and Dependabot |
| Elevation of privilege | A module reads another's tables to get at the data | Modules use only each other's public interfaces; the reference data belongs to its own module | `ModularityTests` |

## Decisions

- Lookups are `POST` with the CSRF token. They change no data, but they cost something and cause calls outside.
- Search happens on our own database as you type; anything that goes outside needs a press of a button.
- A bad field in a response is dropped and the rest is kept, so one odd value doesn't lose a whole answer. A
  reader's own input is still refused whole, as in `library.md`.
- Third-party cover images are not used: fetching them would show the reader's address to another site.
- No ISBN, search text or response is ever logged. The log has the source, the outcome and a count.
- Answers kept in the cache expire (hits after days, misses sooner), and Google Books answers are kept only as long
  as its cache header allows.
- Reference data has no owner and no write endpoint. Only an import changes it.

## Accepted risks

- **A catalogue sees our server's address and what was asked.** Only when the reader presses the button, and with no
  account detail. On a small installation, timing could still point to one person.
- **Answers may be wrong.** That is why nothing is saved without review and every filled field says so.
- **A cached answer is faster than a new one.** That shows only that someone on this server asked before, never who.
- **Terms not yet confirmed** for BnF, Open Library's data and the Library of Congress. They are confirmed in the
  slice that uses them, and the source stays off until then.
- **The limits are in memory** and per instance, like the other limits.
- **The database administrator can read the reference tables and every library**, as in `library.md`.
