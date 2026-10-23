# Threat model: registration and email verification

**Scope:** `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-email`, the emails they send.
**ASVS 5.0 (Level 2) chapters:** V2 Validation and Business Logic, V6 Authentication, V11 Cryptography, V14 Data Protection, V16 Security Logging and Error Handling.
**Personal data:** email address and password hash. Unverified registrations are deleted after 24 hours.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Attacker pre-registers a victim's email with their own password, hoping the victim verifies it (pre-account takeover) | Each attempt keeps its own password; the account is created from the verified attempt; other attempts are cancelled | `RegistrationTests.anAttackersEarlierRegistrationCannotBecomeTheVictimsAccount` |
| Spoofing | Weak or breached password | Minimum 15 characters, NFKC; Have I Been Pwned check | `passwordsMustBeLongEnough`, `breachedPasswordsAreRefused`, `PasswordPolicyTests`, `HaveIBeenPwnedBreachCheckTests` |
| Spoofing | Client fakes its IP to dodge rate limits | nginx overwrites `X-Forwarded-For` with the real address | nginx config; production proxy setup in Phase 3 |
| Tampering | Extra JSON fields to set internal values (mass assignment) | Request records accept only email, password and language | `HostileInputTests` |
| Tampering | Host header injection redirects email links to an attacker's site | Links built from configured `app.base-url`, never from the request | Code review: `RegistrationService` |
| Repudiation | Abuse can't be traced | Log lines for limits, failures and account creation, without personal data | Log review (security event log comes in slice 6) |
| Information disclosure | Discover who has an account (enumeration) | Identical 202 response; password hashed on every path; owner notified by email | `anExistingAccountGetsTheSameResponseAndANoticeInsteadOfALink` |
| Information disclosure | Token stolen from logs, database or Referer headers | 256-bit token, stored only as SHA-256; sent in the URL fragment; `Referrer-Policy: no-referrer` | `registeringSendsAVerificationEmailAndStoresOnlyAHashOfTheToken`, e2e header tests |
| Information disclosure | Errors leak internals | Error codes only; no stack traces | `invalidFieldsAreRejectedWithCodes`, `HostileInputTests` |
| Information disclosure | Password sent to a third party | k-anonymity: only 5 characters of the SHA-1 hash leave the server | `sendsOnlyTheFirstFiveHashCharactersAndAsksForPadding` |
| Denial of service | Flood of registrations exhausts memory/CPU through Argon2 | Per-IP rate limit; at most 4 concurrent hashes, otherwise 503 | `oneClientCannotFloodTheAuthEndpoints`, `PasswordHashingTests`, `RateLimiterTests` |
| Denial of service | Huge request bodies | 4 KB limit on auth endpoints; length required | `oversizedRequestsAreRefusedBeforeAnyWork` |
| Denial of service | Breach-check service hangs | 3-second timeout, fail open | `failsOpenQuicklyWhenTheServiceHangs` |
| Denial of service | Email bombing a victim | At most 3 verification emails per address per hour, plus per-IP limit | `atMostThreeVerificationEmailsPerAddressPerHour` |
| Elevation of privilege | Reuse or brute-force of verification links | Single-use, 24-hour expiry, 256-bit random | `verifyingCreatesTheAccountWithAnArgon2HashAndTheLinkWorksOnlyOnce`, `expiredLinksAreRejected`, `unknownOrMalformedTokensAreRejected` |
| (Integrity) | Email sent for a change that was rolled back | Emails sent only after commit | `noEmailIsSentIfTheDatabaseChangeIsRolledBack` |
| (Privacy) | Unverified data kept forever | Hourly deletion of expired registrations | `expiredRegistrationsAreDeletedAutomatically` |

## Accepted risks
- **Fail-open breach check:** if Have I Been Pwned is down, a breached password may be accepted. Chosen so an outside outage can't block sign-ups; logged as a warning.
- **In-memory rate limits:** reset on restart and not shared between instances. Fine for one instance; revisit if the API is scaled out.
- **Email lost on crash:** if the server stops right after committing, the email may not be sent. The person can retry.

## Still to come
- Bot protection (Cloudflare Turnstile) when the site goes live.
- Web pages for registration and verification (slice 1b), with end-to-end tests.

## Web pages (slice 1b)

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Information disclosure | Verification token stays in the address bar, browser history or a screenshot | Token read once from the URL fragment, then removed with `history.replaceState` | `VerifyEmailPage.test.tsx`, e2e journey (`page.url()` has no token) |
| Information disclosure | "Check your inbox" reveals whether an account exists | Neutral wording for every outcome ("If this address can be used…") | `RegisterPage.test.tsx` |
| Tampering / repeat | Verification sent twice (e.g. React running effects twice) | Guarded so the token is sent at most once | `confirms the token once…` |
| Spoofing | Password managers can't help, pushing users to weak passwords | `autocomplete="email"` / `"new-password"`, pasting allowed, no maximum below 128 | `uses autocomplete hints so password managers work` |
| Information disclosure | Error text leaks internals | The UI only shows translated messages for known codes | `RegisterPage.test.tsx` |
| (Accessibility) | Forms unusable with keyboard or screen reader | Labels, `aria-invalid`, `aria-describedby`, focus moved to the problem field, live regions | axe WCAG 2.2 AA e2e tests, focus assertions |
