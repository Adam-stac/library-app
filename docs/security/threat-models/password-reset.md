# Threat model: password reset and change password

**Scope:** `POST /api/v1/auth/password-reset/request`, `POST /api/v1/auth/password-reset/confirm`, `POST /api/v1/auth/change-password`, and the pages `/forgot-password`, `/reset-password`, `/change-password`.
**ASVS 5.0 (Level 2) chapters:** V6 Authentication (credential recovery, password change), V7 Session Management (terminating sessions after credential changes), V3 Web Frontend Security, V16 Security Logging.
**Personal data:** `password_resets` holds the account ID and a SHA-256 of the token; rows are deleted when used, when the password changes, and hourly once expired.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Guessing or reusing a reset link | 256-bit random token; only its hash is stored; expires in 1 hour; single use; every link for the account is cancelled when the password changes | `requestingAResetEmailsAOneHourSingleUseLinkAndStoresOnlyItsHash`, `resettingChangesThePasswordEndsEverySessionAndTellsTheOwner`, `anExpiredLinkIsRejected` |
| Spoofing | Someone with the old password (or a stolen session) stays in after a reset | Reset ends **every** session; change ends every **other** session and gives this one a new ID | `resettingChangesThePasswordEndsEverySessionAndTellsTheOwner`, `changingThePasswordKeepsThisSessionWithANewIdAndEndsTheOthers` |
| Spoofing | A stolen session is used to change the password and take the account | Current password required; wrong guesses count towards the 15-minute lock | `aWrongCurrentPasswordIsRejectedAndCountsTowardsTheLock` |
| Tampering | Cross-site requests to these endpoints | CSRF token required on all three | `resetRequestsNeedTheCsrfToken`, `changingThePasswordNeedsTheCsrfToken` |
| Repudiation | The owner never learns their password was changed | "Your password was changed" email after every reset or change, with a link to reset | `resettingChangesThePasswordEndsEverySessionAndTellsTheOwner` |
| Information disclosure | Discover which emails have accounts | Same 202 and empty body for every address; email sent in the background; no email to addresses without an account | `anUnknownEmailGetsTheSameAnswerAndNoEmailIsSent` |
| Information disclosure | Reset token leaks through logs, history or the Referer header | Token in the URL `#fragment` (never sent to servers), removed from the address bar on load; `Referrer-Policy: no-referrer` | `ResetPasswordPage.test.tsx`, e2e `forgot password…` |
| Denial of service | Mail-bombing an address with reset emails | At most 3 reset emails per account per hour; per-IP limit on all auth POSTs | `atMostThreeResetEmailsPerHour` |
| Denial of service | Reset used to lock out the owner | Requesting a reset changes nothing until the link is used; the current password keeps working | `requestingAResetEmailsAOneHourSingleUseLinkAndStoresOnlyItsHash` |
| Elevation of privilege | A weak or breached new password | Same rules as registration (15–128 characters, breached-password check) via `NewPasswordRules`; a rejected password leaves the link usable | `aWeakOrBreachedNewPasswordIsRejectedAndTheLinkStillWorks`, `aBreachedNewPasswordIsRejectedWhenChanging` |
| Elevation of privilege | Changing the password without signing in | Endpoint requires a signed-in session (401 otherwise) | `changingThePasswordNeedsSignIn` |

## Accepted risks
- **Small timing difference** between known and unknown emails on reset requests (one database insert). Email sending is in the background, so the difference is a few milliseconds and buried in network noise.
- **Email is the only recovery channel.** Whoever controls the mailbox can reset the password. Once 2FA arrives (slice 4), a reset will not bypass it.
