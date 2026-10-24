# Threat model: two-step verification (authenticator app and recovery codes)

**Scope:** `POST /api/v1/auth/login` (second-step branch), `POST /api/v1/auth/login/2fa`, `GET /api/v1/auth/2fa`, `POST /api/v1/auth/2fa/totp/setup`, `/totp/confirm`, `/totp/disable`, `/recovery-codes`, and the pages `/sign-in` (second step) and `/two-step-verification`.
**ASVS 5.0 (Level 2) chapters:** V6 Authentication (multi-factor, out-of-band, recovery), V7 Session Management, V11 Cryptography, V16 Security Logging.
**Standards:** RFC 6238 (TOTP: HMAC-SHA1, 6 digits, 30 s), RFC 4648 (Base32). Per ADR 0004: authenticator apps and recovery codes, never SMS.
**Personal data:** `totp_credentials` holds an encrypted secret per account; `recovery_codes` holds SHA-256 hashes. Both are deleted with the account or when two-step verification is turned off.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Stolen password alone signs in | With 2FA on, the password step only marks the session "half-way" for 5 minutes; nothing is reachable until a valid code | `signingInThenNeedsACodeFromTheApp` |
| Spoofing | Guessing codes | Wrong codes count towards the same 15-minute lock as wrong passwords; a correct password does **not** clear the count while 2FA is on | `wrongCodesLockTheAccountAndThePasswordDoesNotResetTheCount` |
| Spoofing | Replaying a code seen over someone's shoulder | Each code works once (`last_used_step`); only one step either side accepted | `eachCodeFromTheAppWorksOnlyOnce`, `TotpTests` |
| Spoofing | Skipping the password step | `/login/2fa` only works in a session that just passed the password check | `theSecondStepNeedsThePasswordFirst` |
| Spoofing | Password reset used to bypass 2FA | A reset changes only the password; the second step is still required | `aPasswordResetDoesNotSkipTheSecondStep` |
| Spoofing | Session fixation between the two steps | New session at the password step and a new ID again when the second step succeeds | `SessionController`, `aSessionIdChosenByAnAttackerIsNeverUsed` |
| Tampering | Stolen session used to turn 2FA on (locking the owner out) or off | Turning on needs the password; turning off needs the password **and** a code; new recovery codes need the password; all CSRF-protected | `turningItOnNeedsThePasswordThenACodeFromTheApp`, `turningItOffNeedsThePasswordAndACode` |
| Repudiation | Owner never learns of changes | Emails when 2FA is turned on or off, when recovery codes are replaced, and each time a recovery code is used (with the count left) | `aRecoveryCodeWorksOnceAndTheOwnerIsTold`, `turningItOffNeedsThePasswordAndACode` |
| Information disclosure | Database leak reveals TOTP secrets | Secrets encrypted with AES-256-GCM using `TOTP_ENCRYPTION_KEY` (environment only); each ciphertext bound to its account | `SecretBoxTests`, `turningItOnNeedsThePasswordThenACodeFromTheApp` |
| Information disclosure | Database leak reveals recovery codes | 80-bit random codes, stored as SHA-256 hashes only; shown once | `RecoveryCodesTests`, `turningItOnNeedsThePasswordThenACodeFromTheApp` |
| Information disclosure | QR code leaks via third-party services | QR drawn locally as SVG in the browser; the secret never leaves our origin; CSP unchanged | `QrCode.tsx` |
| Denial of service | Lost phone locks the owner out forever | 10 recovery codes; new set on demand; count shown on the page and in emails | `newRecoveryCodesReplaceTheOldOnes` |
| Elevation of privilege | Half-signed-in session reaches signed-in endpoints | The half-way session has no authentication; `/me` returns 204 and `/2fa` returns 401 | `signingInThenNeedsACodeFromTheApp`, `managingItNeedsSignIn` |
| Elevation of privilege | Another account's encrypted secret copied across | AES-GCM associated data is the account ID, so it won't decrypt elsewhere | `aBoxCopiedToAnotherAccountWontOpen` |

## Decisions
- **Codes accepted in any digits:** Arabic-Indic digits (٠–٩, ۰–۹) and spaces are normalised, so Arabic keyboards work.
- **The 15-character password minimum stays even with 2FA on.** ADR 0004 would allow 8; keeping 15 is stricter and simpler.
- **Key management:** losing or changing `TOTP_ENCRYPTION_KEY` makes existing secrets unreadable, so everyone would need to set up 2FA again (recovery codes still work for signing in). The key lives in `.env` locally, GitHub Actions per run, and Coolify in production.

## Accepted risks
- **Phishing in real time** (a fake site relaying the code within 30 seconds) is not stopped by TOTP. Passkeys (slice 5) are phishing-resistant.
- **Deliberate lockout:** someone who knows the password can lock the owner out for 15 minutes with wrong codes. They would already have half the credentials; the owner should change the password.
