# Threat model: reading a book's title page from a photo

**Scope:** ADR 0011: the "Read the cover or title page" step of Add a book. The browser prepares the photo; the API's
`POST /api/v1/page-readings` sends it to Google Cloud Vision and turns the lines read into suggested fields; the form
fills empty fields with the "Please confirm" note and lists every line. Written before any code. The API (the
pages module, #66) and the form are built. The saved book is covered by
`library.md`; the ISBN checks the reading can trigger, by `book-lookup.md`.
**ASVS 5.0 (Level 2) chapters:** V1 Encoding and Sanitization, V2 Validation and Business Logic, V3 Web Frontend
Security, V4 API and Web Service, V5 File Handling, V8 Authorization, V12 Secure Communication, V13 Configuration, V14
Data Protection, V16 Security Logging and Error Handling.
**Personal data:** a photo of a title page shows which book a reader owns, and so possibly their religion (special
category data). It may also show an owner's name, a stamp or handwriting. The photo and the text read from it are held
only while the request runs: never stored by the app, never logged. Google's terms for online requests: processed in
memory, not stored, not used for training, only request metadata logged (read 31 October 2026).

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Reading pages without an account, spending the app's allowance | Signed-in accounts only; listed in `SecurityConfig` and `SecurityBaselineTests` | `readingNeedsSignInAndTheCsrfToken`, and `SecurityBaselineTests` (`/api/v1/page-readings/status`) |
| Spoofing | A network attacker or a fake host pretends to be Google | One fixed Google host over HTTPS, certificates checked by the JVM's trust store, no custom trust settings, no redirects followed | `onlyTheImageIsSentToTheVisionHostWithTheKeyInAHeader`, `redirectsAreNotFollowedAndErrorsAreCodesOnly` (against a fake server); the endpoint must be HTTPS except for a test's local fake |
| Tampering | A malicious page makes the server read photos for the reader | `POST` with the CSRF token | `readingNeedsSignInAndTheCsrfToken` |
| Tampering | A hostile file: not an image, a huge one, an image that unpacks into billions of pixels, or a file that is something else inside | At most 4 MB; must decode as JPEG or PNG; width × height within a fixed limit, checked from the header before decoding; nothing else accepted, and the bytes are only passed on, never saved or served | `onlyAJpegOrPngWithinTheLimitsIsAccepted` (400 for not an image or too small, 415 for another type, 413 past 4 MB), `aDecompressionBombIsRefusedBeforeDecoding` |
| Tampering | A hostile or broken answer from the reading service (script in a line, direction-control characters, huge text, wrong types) | The answer is untrusted: size limit; every line checked like reader input (NFC, no control or direction-override characters, length); a bad line is dropped and the rest kept; React shows it as text | `hostileLinesAreDroppedOneByOne` (API); `scriptInALineIsShownAsText` (web: every line listed, as text; the server's answer re-checked field by field in `pageReading.test.ts`) |
| Tampering | A wrong reading is saved as fact (a misread name, a line in the wrong field) | Nothing is saved until Save. Only empty fields are filled, each with "Please confirm. Read from the photo." until edited; every line is listed and can be moved; the printed page wins over the catalogue, and a catalogue link is made only on a tap | `TitlePageTests` (the rules, on real pages' wording); `everyFieldReadFromThePageCarriesTheNote`, `aCatalogueScholarIsLinkedOnlyWhenChosen` and "never replaces what you typed" (web, `BookFormPage.test.tsx`) |
| Tampering | Mass assignment: sending an owner or a field mapping with the photo | The request body is the image only; nothing else is read | By design: the request body is the image's bytes (`image/jpeg` or `image/png`) and nothing else; `onlyAJpegOrPngWithinTheLimitsIsAccepted` |
| Repudiation | A reader disputes that a reading happened, or the bill | Each reading is counted (account, day and month, outcome), without the photo or its text | `nothingOfThePhotoIsKeptOrLoggedAndTheKeyNeverAppears` (the table's columns are id, owner, time and outcome only) |
| Information disclosure | Google learns more than the page | Only the image goes to Google, from the server: no account, email, cookie or session; a fixed User-Agent. The browser re-encodes the photo before sending it, so its hidden location, time and phone details never leave the device; the browser never contacts Google (`connect-src 'self'` unchanged) | `onlyTheImageIsSentToTheVisionHostWithTheKeyInAHeader` (a fake server records the request and its headers: no cookie, no CSRF header, the key in a header, never in the address); `thePhotoIsReEncodedWithoutItsMetadata` (web, `pageReading.test.ts`: the file sent is a new JPEG drawn from the picture, at most 2,000 px); the browser can't call Google: `connect-src 'self'` (unchanged, `security-headers.conf`), and the form posts only to `/api/v1/page-readings` (`BookFormPage.test.tsx` checks the request) |
| Information disclosure | The photo or its text kept or logged by the app | Held only while the request runs; not written to the database, disk or log; errors are codes only | `nothingOfThePhotoIsKeptOrLoggedAndTheKeyNeverAppears` (the log holds the outcome and a count, not a word of the page), `redirectsAreNotFollowedAndErrorsAreCodesOnly` |
| Information disclosure | The API key leaks | Read from the environment; never logged, never in an answer or the browser, never in the repository (gitleaks); restricted in Google Cloud to the Cloud Vision API | `nothingOfThePhotoIsKeptOrLoggedAndTheKeyNeverAppears`, `redirectsAreNotFollowedAndErrorsAreCodesOnly` (a refusal quoting the key isn't passed on); gitleaks in CI |
| Information disclosure | A reader doesn't realise the photo goes to Google | A line beside the button names Google; the About page and the privacy notice say what is read and on what terms | The button's description says the photo is read by Google and goes without where or when it was taken (`BookFormPage.test.tsx`) |
| Denial of service | Running up the bill, or using up the free allowance for everyone | Counted in the database: per account 30 a day and 300 a month, and for the app 1,000 a month by default; at a limit the button says so and typing still works; raising the app's cap is a deliberate setting; a Google Cloud budget alert as a second line | `theAccountsDayAndMonthLimitsAndTheAppsCapAreKept` (Google is asked exactly as often as the cap allows); `withoutAKeyTheFeatureIsOff`; `atALimitTheFormStillWorks` (web) |
| Denial of service | A slow or huge answer ties up the server | Timeout of about 10 seconds; size limit on the answer; no database transaction held open during the call; a limit on readings running at once | `aSlowReadingIsCutOff`, `anOversizedAnswerIsCutOff`; at most 4 readings wait on Google at once, the rest get 503 |
| Elevation of privilege | SSRF: making the server fetch something else | The address is fixed in the code and only the image is sent; nothing from the reader or the answer is ever fetched | By design: the address is built once from configuration; `onlyTheImageIsSentToTheVisionHostWithTheKeyInAHeader` checks the path |

## Accepted risks

- **Google sees the page.** That is the feature. It is limited to the image, stated beside the button, and covered by
  Google's terms above. A reader who prefers not to can type the book in, as before.
- **A page can be misread.** Every field read is marked to confirm, nothing is saved without the reader, and the lines
  read are shown in full.
