# Threat model: security activity

**Scope:** `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/{handle}/end`, `POST /api/v1/auth/sessions/end-others`, `GET /api/v1/auth/security-events`, the security page (`/security`), the new-device and sign-in-paused emails, and the absolute session lifetime.
**ASVS 5.0 (Level 2) chapters:** V7 Session Management (active sessions, termination, absolute lifetime), V6 Authentication (notifying the owner), V16 Security Logging, V14 Data Protection.
**Personal data:** `security_events` holds the event type, a short detail, a device description such as "Firefox on Linux" (never the raw User-Agent), the IP address and the time. Kept for 90 days, deleted with the account. Session attributes hold the same device description and IP.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Someone signs in with a stolen password and the owner never knows | Email on a sign-in from a device not seen before, with links to the security page and to reset the password | `theOwnerIsEmailedAboutASignInFromANewDevice`, e2e `security-activity` |
| Spoofing | Password guessing goes unnoticed | Every failure is logged; when sign-in is paused after 5 wrong passwords, the owner is emailed once | `wrongPasswordsAndTheLockAreRecordedAndTheOwnerIsTold` |
| Spoofing | A stolen session lasts for ever because it is kept busy | Absolute lifetime of 7 days from sign-in, however active (`app.session.max-age`), as well as the 12-hour idle limit | `SessionLifetimeFilterTests` |
| Tampering | A malicious page signs out the owner's devices | CSRF token required on both sign-out actions | `SecurityConfig` (signed-in POSTs), `SecurityPage.test.tsx` |
| Repudiation | The owner can't tell what happened | Sign-ins (with method), failures, lock, sign-outs, password, two-step, recovery-code and passkey changes are all logged in the same transaction as the change | `securityChangesAreRecorded`, `signingInIsRecordedWithTheDeviceButNotTheRawBrowserString` |
| Information disclosure | The session list hands out other sessions' cookies | Sessions are shown by a one-way handle (SHA-256 of the session ID, shortened), never the real ID | `theSessionListShowsEachDeviceAndWhichIsThisOne` |
| Information disclosure | Another account's activity or sessions are seen | Lists are filtered by the signed-in account; ending a session checks it belongs to that account | `anotherAccountsSessionCantBeEnded` |
| Information disclosure | More personal data than needed is kept | Only a short device description is stored; events are deleted after 90 days | `signingInIsRecordedWithTheDeviceButNotTheRawBrowserString`, `eventsOlderThan90DaysAreDeleted` |
| Denial of service | Emails flood the owner | New-device email only for a device type not seen in the log; lock email only when the lock starts | `theOwnerIsEmailedAboutASignInFromANewDevice`, `wrongPasswordsAndTheLockAreRecordedAndTheOwnerIsTold` |
| Elevation of privilege | Viewing or ending sessions without signing in | All four endpoints need a signed-in session (401 otherwise) | `theActivityIsOnlyVisibleWhenSignedIn` |
| Elevation of privilege | A stolen session stays in after the owner acts | The owner can end any other session, or all of them, and it stops working at once | `signingOutAnotherDeviceEndsItsSession`, `signingOutEverywhereElseKeepsOnlyThisDevice`, e2e `security-activity` |

## Decisions
- The current session can't be ended from the list (`current_session`); "Sign out" does that, so nobody signs themselves out by mistake.
- The device description comes from the User-Agent header, which anyone can fake. It is a guide for the owner, not evidence, and the page says so.
- The first sign-in on an account doesn't send a new-device email: there is nothing to compare it with, and the person has just confirmed their email.
- Behind a proxy, the IP address is the client's only when the proxy's forwarded headers are trusted (`server.forward-headers-strategy: framework` in production). Locally behind nginx it is the nginx container's address.

## Accepted risks
- **A new-device email can be avoided** by an attacker who copies the victim's exact browser and system. Two-step verification and passkeys remain the real protection; the email is an extra signal.
- **The log is in the same database as the account.** Someone with database write access could change it. Server logs (separate from the database) also record failures and locks.
- **Device type, not device:** two Windows laptops with Chrome look the same, so a sign-in from a second one doesn't trigger an email.
