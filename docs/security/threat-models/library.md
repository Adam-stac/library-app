# Threat model: the library (authors, places, works and editions)

**Scope:** the `authors`, `places` and `library` modules (ADR 0006): their endpoints under
`/api/v1/authors`, `/api/v1/places`, `/api/v1/works` and `/api/v1/editions`, and the web pages for
them. Built in slices 10 (authors), 11 (places), 12 (works and editions) and 13 (browse and search).
Test names marked *(planned, slice N)* are written in that slice; this file is updated as each slice
is built. Links between works, export and the external lookups get their own threat models.
**ASVS 5.0 (Level 2) chapters:** V8 Authorization, V2 Validation and Business Logic, V1 Encoding and
Sanitization, V4 API and Web Service, V14 Data Protection, V16 Security Logging and Error Handling.
**Personal data:** everything a user enters is personal data, and a library of religious books can
reveal religious belief, which UK GDPR treats as special category data. It is kept until the user
deletes it or deletes their account (`ON DELETE CASCADE`); there is no automatic expiry, because
keeping it is the purpose of the app. It never appears in logs or error messages. The shared
starter list of places is not personal data.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Using the library without signing in | Every library endpoint needs a signed-in session; anything not listed in `SecurityConfig` is denied | `libraryNeedsSignIn` *(planned, slices 10–12)* |
| Tampering | A malicious page creates, edits or deletes records | CSRF token required on every `POST`, `PUT` and `DELETE` | `libraryWritesNeedTheCsrfToken` *(planned, slices 10–12)* |
| Tampering | Changing or deleting another user's record by its ID (IDOR) | Every query includes the signed-in user's ID; another user's record answers 404 | `CrossUserAccessTests` — every endpoint, run as a second user *(planned, slices 10–12)* |
| Tampering | Linking your record to another user's author or place by sending its ID | Every referenced ID is checked against the signed-in user (or the shared list, for places) | `cantLinkAWorkToAnotherUsersAuthor`, `cantUseAnotherUsersPlace` *(planned, slices 11–12)* |
| Tampering | Setting `owner_id`, `id` or `version` in the request body (mass assignment) | Request bodies are fixed records without those fields, so a value sent for them is never read | `ownerAndIdInTheBodyAreIgnored` *(planned, slice 10)* |
| Tampering | Changing or deleting a place on the shared list | Shared places have no owner and every write requires ownership | `sharedPlacesCantBeChangedOrDeleted` *(planned, slice 11)* |
| Tampering | An edit from one device silently replaces a newer edit from another | Each record has a `version`; a stale edit gets 409 `stale_version` | `aStaleVersionIsRefused` *(planned, slice 10)* |
| Tampering | Script or markup in a name, biography or note runs in the browser (stored XSS) | Plain text only, shown by React as text; the CSP blocks inline script; ZAP baseline in CI | `markupInABiographyIsShownAsText` (component test) *(planned, slice 10)*, ZAP |
| Tampering | Hidden direction-control characters make a name display differently from what is stored | U+202A–U+202E and U+2066–U+2069 and control characters are refused; text is NFC-normalised | `directionControlCharactersAreRefused` *(planned, slice 10)* |
| Tampering | Invalid ISBNs or deposit numbers pollute the data (and later lookups) | ISBN-10/13 check digit, accepted digit forms converted, deposit number limited to digits, `/`, `-` and spaces | `IsbnTests`, `depositNumberAcceptsOnlyItsCharacters` *(planned, slice 12)* |
| Repudiation | A user disputes when a record was changed | Low risk: each library belongs to one person. Records keep `created_at` and `updated_at`; library edits are not security events | Not tested; recorded as a decision |
| Information disclosure | Probing IDs to learn whether other users' records exist | Random UUIDs; a missing record and another user's record give the same 404 | `missingAndOtherUsersRecordsLookTheSame` *(planned, slice 10)* |
| Information disclosure | Lists or search return another user's records | Lists and search are scoped to the signed-in user (plus the shared places list) | `listsOnlyShowYourOwnRecords` *(planned, slices 10–12)*, `searchOnlyFindsYourOwnRecords` *(planned, slice 13)* |
| Information disclosure | Library contents (which can reveal religion) leak through errors or logs | Errors return codes and field names only, never the value; no entered text is logged | `errorsNeverEchoTheInput` in `HostileInputTests` *(planned, slice 10)* |
| Information disclosure | Deleted libraries linger | The account's library is deleted in the same transaction as the account | `deletingTheAccountRemovesTheLibrary` *(planned, slices 10–12)* |
| Denial of service | Filling the database (huge fields or millions of records) | Field limits in the API and database; per-account limits checked under a transaction lock; a body-size limit for library requests | `fieldLimitsAreEnforced`, `limitsPerAccountAreEnforced`, `oversizedBodiesAreRefused` *(planned, slice 10)* |
| Denial of service | Flooding the API with writes | A per-account limit on library writes per minute | `tooManyWritesAreSlowedDown` *(planned, slice 10)* |
| Denial of service | Asking for enormous pages | Lists are paged; at most 100 per page | `pageSizeIsCapped` *(planned, slice 10)* |
| Denial of service | Expensive search patterns | `%` and `_` are matched literally, the search text has a length limit, no regular expressions | `wildcardsInSearchAreLiteral` *(planned, slice 13)* |
| Elevation of privilege | Deleting a shared place, or a record another user depends on, to damage their library | Shared places can't be deleted; records are never shared between users; an author or place still in use can't be deleted (409 `in_use`) | `sharedPlacesCantBeChangedOrDeleted`, `aRecordInUseCantBeDeleted` *(planned, slices 10–12)* |
| Elevation of privilege | A module bypasses another module's ownership checks by reading its tables | Modules use only each other's public interfaces; Spring Modulith's test fails the build otherwise | `ModularityTests` |

## Decisions

- Another user's record answers 404, never 403, so a valid ID can't be told apart from a random one.
- The web app works out the CE years a Hijri year overlaps for display only; the database stores
  only what the user typed.
- Library edits are not written to the security activity log. They aren't security events, and
  logging them would copy personal data into a second place.
- The muhaqqiq is typed in as text for now, not linked to an author record.

## Accepted risks

- **The database administrator can read every library.** Data is not encrypted per user. The
  privacy notice (go-live checklist) must say who can access it.
- **Backups still hold deleted records** until they age out, as for accounts.
- **The write limit is in memory** and per instance, like the existing auth rate limit.
- **The shared starter list may contain mistakes.** It is reviewed in the pull request that adds
  it, and users can add their own places instead.
