# Threat model: the library (authors, places, sciences, works and editions)

**Scope:** the `authors`, `places` and `library` modules (ADR 0006, ADR 0007): their endpoints under
`/api/v1/authors`, `/api/v1/places`, `/api/v1/sciences`, `/api/v1/works` and `/api/v1/editions`, and the web
pages for them, plus `/api/v1/bookmarks`, `/api/v1/benefits`, `/api/v1/library-settings`, `/api/v1/search` and `/api/v1/home`. Built in slices 10 (authors), 11 (places), 12 (sciences), 13 (works and editions, with purchase
and reading dates) 14 (bookmarks), 15 (benefits) and 16 (browse, search and the home summary). The Ḥāsib bot gets its own threat
model. Authors, places, sciences, works (slice 13a), editions with the
library settings (slice 13b), bookmarks (slice 14), benefits (slice 15), search (slice 16a) and the home summary
(slice 16b) are built: the whole library backend. Test names marked *(planned, slice N)* are written in that slice, and this file is updated
as each slice is built. API tests are in `AuthorTests`, `PlaceTests`, `ScienceTests`, `WorkTests` and
`EditionTests`, `BookmarkTests`, `BenefitTests`, `SearchTests` and `HomeTests` unless
another class is named. Links between works, export and the external lookups get their own threat models.
**ASVS 5.0 (Level 2) chapters:** V8 Authorization, V2 Validation and Business Logic, V1 Encoding and
Sanitization, V4 API and Web Service, V14 Data Protection, V16 Security Logging and Error Handling.
**Personal data:** everything a user enters is personal data, and a library of religious books can
reveal religious belief, which UK GDPR treats as special category data. It is kept until the user
deletes it or deletes their account (`ON DELETE CASCADE`); there is no automatic expiry, because
keeping it is the purpose of the app. It never appears in logs or error messages. The shared
starter list of places is not personal data.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Using the library without signing in | Every library endpoint needs a signed-in session; anything not listed in `SecurityConfig` is denied | `libraryNeedsSignIn`, `placesNeedSignIn`, `sciencesNeedSignIn`, `worksNeedSignIn`, `editionsAndSettingsNeedSignIn`, `bookmarksNeedSignIn`, `benefitsNeedSignIn`, `searchNeedsSignIn`, `theSummaryNeedsSignIn` |
| Tampering | A malicious page creates, edits or deletes records | CSRF token required on every `POST`, `PUT` and `DELETE` | `libraryChangesNeedTheCsrfToken`, `placeChangesNeedTheCsrfToken`, `scienceChangesNeedTheCsrfToken`, `workChangesNeedTheCsrfToken`, `editionAndSettingsChangesNeedTheCsrfToken`, `bookmarkChangesNeedTheCsrfToken`, `benefitChangesNeedTheCsrfToken` |
| Tampering | Changing or deleting another user's record by its ID (IDOR) | Every query includes the signed-in user's ID; another user's record answers 404 | `anotherUsersAuthorsAreInvisibleAndUnchangeable`, `anotherUsersPlacesAreInvisibleAndUnchangeable`, `anotherUsersSciencesAreInvisibleAndUnchangeable`, `anotherUsersWorksAreInvisibleAndUnchangeable`, `anotherUsersEditionsAreInvisibleAndUnchangeable`, using the shared `CrossUserAccess` check (read, edit and delete as a second user); `anotherUsersBenefitsAreInvisibleAndUnchangeable`, `anotherUsersBookmarksAreInvisibleAndUnchangeable` (a bookmark is reached only through its edition); the library settings have no ID at all, only "mine" (`eachAccountKeepsItsOwnDefaultCurrency`) |
| Tampering | Linking your record to another user's author, place, science or work by sending its ID | Every referenced ID is checked against the signed-in user (or the shared list, for places), through the owning module's public interface (`Places.usableBy`, `Authors.usableBy`); another user's record gives the same answer as one that doesn't exist | `cantUseAnotherUsersPlace` (`AuthorPlaceTests`), `cantLinkAWorkToAnotherUsersAuthorOrScience`, `cantAddAnEditionToAnotherUsersWork`, `cantNameAnotherUsersEdition` (benefits) |
| Tampering | Setting `owner_id`, `id` or `version` in the request body (mass assignment) | Request bodies are fixed records without those fields, so a value sent for them is never read | `ownerIdAndVersionInTheBodyAreNeverUsed` (authors, places, sciences and works; for places it also covers `shared`) |
| Tampering | Changing or deleting a place on the shared list | Shared places have no owner (`owner_id` is NULL) and every write requires `owner_id` to match the signed-in user; an edit or delete answers 403 `read_only` | `sharedPlacesAreVisibleToEveryoneButCantBeChangedOrDeleted` |
| Tampering | Changing the starter list of sciences for everyone | The starter list is a separate read-only table with no endpoint; each account changes only its own copy | `changingYourListLeavesOtherAccountsAndTheStarterListAlone` |
| Tampering | A bookmark pointing somewhere the book doesn't have (volume 14 of 13, page 0) | The volume must be within the edition's volumes (and is needed for a set); the page is 1 to 99,999; an edit can't cut the volumes below the bookmark, and the two lock the edition so they can't race | `theVolumeMustFitTheEdition`, `thePageIsChecked`, `anEditCantLeaveTheBookmarkInAVolumeThatIsGone`; the same rules for a benefit's volume and page (`whereABenefitCameFromIsChecked`, `anEditCantLeaveABenefitInAVolumeThatIsGone`) |
| Spoofing | A benefit claims to come from the Ḥāsib bot (or anywhere else) when it didn't | The source is set by the code that received it (`app` for the API), never read from the request; the database allows only `app` and `hasib` | `theSourceOwnerIdAndVersionInTheBodyAreNeverUsed`, `theTextIsChecked` |
| Tampering | An edit from one device silently replaces a newer edit from another | Each record has a `version`, sent as its `ETag`; an edit must send it back in `If-Match`. A stale one gets 409 `stale_version`, a missing one 400 `version_required` | `aStaleVersionIsRefused` (authors, places, sciences, works, editions and benefits); a bookmark has no version on purpose, because the newest move is the right one (`theNewestMoveWins`), `AuthorFormPage.test.tsx` |
| Tampering | Script or markup in a name, biography or note runs in the browser (stored XSS) | Plain text only, shown by React as text; the CSP blocks inline script; ZAP baseline in CI | `AuthorPage.test.tsx` ("shows markup in a biography as text, never running it"), ZAP |
| Tampering | Hidden direction-control characters make a name display differently from what is stored | U+202A–U+202E and U+2066–U+2069 and control characters are refused; text is NFC-normalised | `directionControlCharactersAreRefused` (here and in `TextInputTests`), `textIsTrimmedAndNormalisedBeforeItIsStored` |
| Tampering | Invalid ISBNs or deposit numbers pollute the data (and later lookups) | ISBN-10/13 check digit, accepted digit forms converted, deposit number limited to digits, `/`, `-` and spaces | `PrintedNumbersTests` (`anIsbnWithAWrongCheckDigitOrShapeIsRefused`, `depositNumberAcceptsOnlyItsCharacters`), `isbnsAndDepositNumbersAreCheckedAndStoredInStandardDigits` |
| Tampering | Impossible reading dates or prices (finished before starting, a date in the future, 95.555 pounds, a made-up currency) | Dates from 1900 to tomorrow (UTC, for time zones ahead); a finish needs a start and can't be before it; amounts in the currency's minor units with no more decimals than it has; ISO 4217 codes only; status worked out from the dates, never stored or accepted | `readingDatesAreChecked`, `pricesAreChecked`, `PrintedNumbersTests`, `ownerIdVersionAndStatusInTheBodyAreNeverUsed` |
| Repudiation | A user disputes when a record was changed | Low risk: each library belongs to one person. Records keep `created_at` and `updated_at`; library edits are not security events | Not tested; recorded as a decision |
| Information disclosure | Probing IDs to learn whether other users' records exist | Random UUIDs; a missing record and another user's record give the same 404 | `anotherUsersAuthorsAreInvisibleAndUnchangeable` (`CrossUserAccess` compares the two answers) |
| Information disclosure | Lists or search return another user's records | Lists and search are scoped to the signed-in user (plus the shared places list) | `listsOnlyShowYourOwnRecordsInNameOrder`, `listsShowTheSharedListAndYourOwnPlaces`, `aNewAccountStartsWithItsOwnCopyOfTheStarterList`, `listsOnlyShowYourOwnWorksInTitleOrder` (including filtering by someone else's science or author), `listsOnlyShowYourOwnEditions`, `theMostRecentlyMovedComeFirstAndOnlyYourOwn`, `listsShowYourOwnBenefitsNewestFirst`, `searchOnlyFindsYourOwnRecords` (authors, places, works, editions and benefits; the shared places are found too), `theSummaryOnlyCountsYourOwnLibrary` |
| Information disclosure | Library contents (which can reveal religion) leak through errors or logs | Errors return codes and field names only, never the value (including a wrong-type query parameter); no entered text is logged | `errorsNeverEchoTheInput` (authors, places, sciences and works, including a name already in use), `AuthorHostileInputTests`, `PlaceHostileInputTests`, `ScienceHostileInputTests`, `WorkHostileInputTests`, `EditionHostileInputTests`, and `malformedRequestsAreRejectedCleanly` for benefits, `errorsNeverEchoTheSearchText`; the 409 `in_use` answer gives only counts, never names |
| Information disclosure | Deleted libraries linger | The account's library is deleted in the same transaction as the account | `deletingTheAccountRemovesTheLibrary`, `deletingTheAccountRemovesItsPlacesButNotTheSharedList`, `deletingTheAccountRemovesItsSciences`, `deletingTheAccountRemovesTheWholeLibrary` (with every kind of link between records), `deletingTheAccountRemovesItsEditionsAndSettings`, `deletingTheEditionOrTheAccountRemovesTheBookmark`, `deletingTheAccountRemovesItsBenefits` |
| Denial of service | Filling the database (huge fields or millions of records) | Field limits in the API and database; per-account limits checked under a transaction lock; a body-size limit for library requests | `fieldLimitsAreEnforced`, `otherNamesAreCleanedAndLimited`, `coordinatesAreChecked`, `limitsPerAccountAreEnforced`, `addsAtTheSameTimeCantPassTheLimit`, `oversizedBodiesAreRefused` (authors and places); for sciences `namesAreCheckedLikeAnyOtherText`, `limitsPerAccountAreEnforced` and `addsAtTheSameTimeCantPassTheLimitOrRepeatAName` (200 per account); for works `titlesAreChecked`, `authorsAreKeptInOrderOnceEach`, `limitsPerAccountAreEnforced`, `addsAtTheSameTimeCantPassTheLimit` and `oversizedBodiesAreRefused` (10,000 per account, 20 authors per work); the same four for editions, plus `otherFieldsAreChecked` (10,000 per account); for benefits `theTextIsChecked`, `limitsPerAccountAreEnforced`, `addsAtTheSameTimeCantPassTheLimit` and `malformedRequestsAreRejectedCleanly` (20,000 per account, 5,000 characters each); one bookmark per edition |
| Denial of service | Flooding the API with changes | At most 120 library changes a minute per account (`LibraryRequestFilter`) | `tooManyChangesAreSlowedDown` (the filter covers every library path) |
| Denial of service | Asking for enormous pages | Lists are paged; at most 100 per page | `pageSizeIsCapped`, `listParametersAreChecked`; the sciences list isn't paged because an account has at most 200 |
| Denial of service | Expensive search patterns | `%` and `_` are matched literally (`library_like_pattern`), the search text is at most 100 characters and needs a letter or digit once vowel marks are set aside, at most 50 results of each kind, no regular expressions from the user | `wildcardsInSearchAreLiteral`, `theSearchTextIsChecked` |
| Elevation of privilege | Deleting a shared place, or a record another user depends on, to damage their library | Shared places can't be deleted; records are never shared between users; an author, place or science still in use can't be deleted (409 `in_use`). Deleting locks the record first, and linking a record locks it against deletion until the link is saved, so the two can't race; foreign keys checked at commit are the second line of defence | `sharedPlacesAreVisibleToEveryoneButCantBeChangedOrDeleted`, `aPlaceInUseCantBeDeleted`, `anAuthorNamedInAWorkCantBeDeleted`, `aScienceGivenToAWorkCantBeDeleted` |
| Elevation of privilege | A module bypasses another module's ownership checks by reading its tables | Modules use only each other's public interfaces (`Places`, `PlaceReferences`, `Authors`, `AuthorReferences`); Spring Modulith's test fails the build otherwise | `ModularityTests` |

## Decisions

- Another user's record answers 404, never 403, so a valid ID can't be told apart from a random one.
- The web app works out the CE years a Hijri year overlaps for display only; the database stores
  only what the user typed.
- Library edits are not written to the security activity log. They aren't security events, and
  logging them would copy personal data into a second place.
- The muhaqqiq is typed in as text for now, not linked to an author record.
- The version travels in the `ETag` and `If-Match` headers, so the request body never carries it.
- Malformed requests (random text, wrong types, wrong content types) answer 400 or 415, never 500
  (`AuthorHostileInputTests`, `PlaceHostileInputTests`).
- A place on the shared list answers 403 `read_only` to an edit or delete, not 404: everyone can already see it,
  so there is nothing to hide.
- A place still in use answers 409 `in_use` with how many records of each kind use it (for example
  `"usedBy":{"authors":2}`), never their names, so the error contains no text the user typed.
- The places module never depends on the modules that refer to it: they tell it how often a place is used
  through `PlaceReferences`.
- Each account has its own copy of the starter sciences, given by a trigger on `users` (ADR 0007), so
  accounts created any way get it. Two of an account's sciences can't share a name (400 `already_used`,
  naming the field but not the name); a unique index backs this up.
- Links between library records (an author's places, a work's science and authors) are foreign keys checked
  when the transaction commits (`DEFERRABLE INITIALLY DEFERRED`, V12). Deleting an account deletes everything in
  one go, in whatever order Postgres follows the cascades, so a check after each statement could fail half way.
  If the database ever refuses a change the API allowed, the answer is 409 `conflict`, and the log records only
  that it happened, never the database's message, which can contain what was typed.
- Adding a book can create its work in the same request (`work` instead of `workId`), in one transaction: if
  either part is refused, neither is saved, and the work's errors are reported as `work.<field>`.
- Deleting a work deletes its editions (the web page asks first, ADR 0006).
- Deleting an edition keeps its benefits and removes the link (`deletingTheEditionKeepsTheBenefit`); the volume
  and page stay, as a note of where the benefit came from.
- ISBNs and legal deposit numbers are accepted in Western, Arabic-Indic and Persian digits, with an "ISBN" or
  "ردمك" label, and stored as standard digits only.
- Search and sorting are Arabic-aware (V16): vowel marks and the tatweel are ignored, أ إ آ ٱ count as ا, ى as
  ي, ة as ه, transliteration marks are ignored (Ḥadīth as hadith), and Arabic-Indic digits count as 0-9. Lists
  ignore a leading "ال", "al-" or "the", as catalogues do. The keys are worked out by the database from what was
  typed, which is stored unchanged (`searchMatchesTheArabicAwareWay`, `listsFollowCatalogueOrder`).
- The home summary counts copies owned (a set of volumes once), and its percentages by science add up to exactly
  100 (largest remainder, `SharesTests`). "This year" is the calendar year in UTC. Spending is totalled per
  currency, never converted. A book being read is "quiet" when neither its bookmark nor its start has moved for
  90 days.
- Coordinates are kept to 5 decimal places (about a metre). The starter list gives them to 2 (about a
  kilometre), since they are only for a map view.

## Accepted risks

- **The database administrator can read every library.** Data is not encrypted per user. The
  privacy notice (go-live checklist) must say who can access it.
- **Backups still hold deleted records** until they age out, as for accounts.
- **The write limit is in memory** and per instance, like the existing auth rate limit.
- **The shared starter list may contain mistakes.** It is reviewed in the pull request that adds
  it, and users can add their own places instead.
