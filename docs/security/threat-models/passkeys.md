# Threat model: passkeys

**Scope:** `GET /api/v1/auth/passkeys`, `POST /api/v1/auth/passkeys/register/options`, `/register`, `/{id}/delete`, `/login/options`, `/login`, the passkeys page and the "Sign in with a passkey" button.
**ASVS 5.0 (Level 2) chapters:** V6 Authentication (multi-factor, phishing-resistant authenticators), V7 Session Management, V11 Cryptography, V16 Security Logging.
**Standards:** W3C WebAuthn Level 3, verified by webauthn4j (ADR 0005).
**Personal data:** `passkeys` holds public keys, credential IDs, a signature counter, a label and dates. Nothing stored can be used to sign in. Each account has a random 32-byte user handle, never its email or ID.

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | Phishing site relays a passkey sign-in | The browser only offers a passkey to its own site, and the server checks the origin and site ID in every answer | `aPasskeyMadeForAnotherWebsiteIsRejected`, `aSignInAnswerForAnotherWebsiteIsRejected` |
| Spoofing | Replaying a captured sign-in | One-time challenge per attempt, kept in the session for 5 minutes and removed when read | `aSignInAnswerWorksOnlyOnce`, `signingInWithoutStartingIsRefused`, `finishingWithoutStartingIsRefused` |
| Spoofing | Forged or altered answer | Signature checked against the stored public key | `aTamperedSignatureIsRejected`, `anUnknownPasskeyIsRejected` |
| Spoofing | A stolen device used without its owner | User verification (fingerprint, face or PIN) required when adding and when signing in | `aPasskeyWithoutFingerprintFaceOrPinIsRejected`, `signingInWithoutFingerprintFaceOrPinIsRejected` |
| Spoofing | A cloned authenticator | Signature counter must keep increasing; a counter going backwards is rejected | `aClonedPasskeyIsCaughtByItsCounter` |
| Spoofing | Session fixation at passkey sign-in | Any earlier session (including the one holding the challenge) is replaced with a new one | `signingInWithAPasskeyNeedsNoPasswordAndStartsAFreshSession` |
| Tampering | Stolen session used to add an attacker's passkey (a permanent backdoor) | Adding needs the password again; the owner is emailed; CSRF required | `addingAPasskeyNeedsThePasswordAndStoresOnlyThePublicKey` |
| Repudiation | Owner doesn't notice a new or removed passkey | Email on every add and remove; list shows when each was added and last used | `addingAPasskeyNeedsThePasswordAndStoresOnlyThePublicKey`, `removingAPasskeyNeedsThePasswordAndStopsItWorking` |
| Information disclosure | Account details leaked through passkeys | Random user handle instead of email or ID; attestation not requested, so no device details are collected | `addingAPasskeyNeedsThePasswordAndStoresOnlyThePublicKey` |
| Denial of service | Flooding the sign-in options endpoint with sessions | Per-IP rate limit on all auth POSTs; pre-sign-in sessions expire after 5 minutes | `AuthRateLimitFilter`, `PasskeyController` |
| Elevation of privilege | Managing passkeys without signing in | List, add and remove need a signed-in session (401 otherwise) | `managingPasskeysNeedsSignIn` |
| Elevation of privilege | A locked account signs in with a passkey | Locked accounts are refused | `aLockedAccountCantSignInWithAPasskey` |

## Decisions
- A passkey sign-in skips the password and authenticator code: it is multi-factor and phishing-resistant on its own (ADR 0005).
- Up to 10 passkeys per account; the same passkey can't be added twice.
- Algorithms accepted: EdDSA, ES256 and RS256. Tests cover EdDSA and ES256 with a software authenticator whose output is cross-checked with Yubico's `python-fido2` library; the browser test uses Chrome's virtual authenticator.

## Accepted risks
- **Synced passkeys** (iCloud Keychain, Google Password Manager) are only as safe as the owner's cloud account. That's the industry norm and still far stronger than passwords.
- **Failed passkey answers don't count towards the sign-in lock**, because an attacker would need the private key to produce a valid one; failures are logged instead.
