# Threat model: sign in and sign out

**Scope:** `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, the session cookie.
**ASVS 5.0 (Level 2) chapters:** V6 Authentication, V7 Session Management, V3 Web Frontend Security (cookies, CSRF), V16 Security Logging and Error Handling.
**Personal data:** sessions store the account ID only; they expire after 12 hours idle and are deleted by Spring Session's cleanup job.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Password guessing against one account | 5 failures lock the account for 15 minutes (silently); per-IP limit on all auth POSTs | `anAccountLocksForAWhileAfterFiveWrongPasswords`, `oneClientCannotFloodTheAuthEndpoints` |
| Spoofing | Session fixation (attacker plants a session ID before sign-in) | Any existing session destroyed; brand-new ID issued at sign-in | `aSessionIdChosenByAnAttackerIsNeverUsed` |
| Spoofing | Login CSRF (victim silently signed into attacker's account) | CSRF token required on sign-in itself | `signingInWithoutTheCsrfTokenIsRefused` |
| Tampering | Cross-site request forgery on signed-in actions | Double-submit CSRF token (cookie + header) on every state-changing request; `SameSite=Lax` | `signingInWithoutTheCsrfTokenIsRefused`, `theCsrfTokenIsReplacedAfterSigningIn` |
| Information disclosure | Discover which emails have accounts | Identical response and equal work (dummy hash) for unknown email, wrong password and locked account | `aWrongPasswordAndAnUnknownEmailLookIdentical` |
| Information disclosure | Session cookie stolen by injected script | `HttpOnly`; `__Host-` prefix with `Secure`, `Path=/` | `signingInCreatesASecureServerSideSession` |
| Information disclosure | Password hash or internals in responses | Responses contain only email and language; errors are codes | `signingInCreatesASecureServerSideSession`, `malformedSignInRequestsAreRejectedCleanly` |
| Repudiation | Attacks can't be traced | Failed sign-ins and locked-account attempts logged with the account ID (no email or password) | Server logs, and the security event log (see `security-activity.md`) |
| Denial of service | Argon2 checks used to exhaust memory | Shared cap of 4 concurrent hashes/checks (503 when saturated) | `PasswordHashingTests` |
| Denial of service | Attacker locks a victim out deliberately | Lock is temporary (15 minutes) and per account; per-IP limit slows mass locking | Accepted risk, below |
| Elevation of privilege | Stolen cookie keeps working after sign-out | Session deleted on the server at sign-out | `signingOutEndsTheSessionOnTheServer` |
| Elevation of privilege | Reaching data without signing in | Deny by default; anonymous requests get 401 | `SecurityBaselineTests`, `whoAmISaysNobodyWhenSignedOut` |

## Accepted risks
- **Deliberate lockouts:** someone who knows a victim's email can lock them out for 15 minutes at a time. Mitigated by the per-IP limit; the owner is emailed when sign-in is paused and can see the attempts on the security page.

## Slice 2b: web pages

| Threat | Control | Proven by |
| --- | --- | --- |
| Session cookie read by injected script | `__Host-SESSION` is HttpOnly; the page never sees it | e2e `sign in with a confirmed account…` (checks `document.cookie`) |
| Cookie flags weakened in the real stack (nginx in front) | Flags checked in the browser through nginx: HttpOnly, Secure, SameSite=Lax, Path=/ | e2e `sign in with a confirmed account…` |
| Login CSRF through the real stack | Sign-in without the token gets 403 | e2e `signing in without the CSRF token is refused` |
| Pages reveal which part of the sign-in was wrong | One message for every failure; the password box is cleared | `SignInPage.test.tsx`, e2e journey |
| Signing out only in the browser, leaving the session alive | Sign-out calls the API; the page shows signed out only after the server confirms it | `Layout.test.tsx`, e2e (`/me` returns 401 afterwards) |
| Open redirect after sign-in | Always goes to `/`; no "return to" address is accepted from the URL | `SignInPage.tsx` (no redirect parameter) |
