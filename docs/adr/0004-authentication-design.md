# 0004. Authentication design

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

User accounts protect each person's library. The design follows OWASP ASVS Level 2 and NIST SP 800-63B.

## Decision

- **Web sign-in uses server-side sessions** in `HttpOnly`, `Secure`, `SameSite` cookies (Spring Session, stored in Postgres), so JavaScript can never read a session. Revises the earlier plan of tokens in the browser.
- **Mobile (later) uses short-lived access tokens with rotating refresh tokens**, stored server-side so they can be revoked.
- **One verified email per account.** Changing it requires verifying the new address and notifies the old one.
- **Passwords:** minimum 15 characters (8 with 2FA), maximum 128, NFKC-normalised, no composition rules or expiry, checked against Have I Been Pwned (k-anonymity), hashed with Argon2id (19 MiB, 2 iterations).
- **Registration creates a pending registration**, each with its own password hash and hashed one-time token. The account is created only when the email is verified, from that attempt, which prevents pre-account takeover.
- **No account enumeration:** registration, sign-in and password reset respond identically whether or not an account exists.
- **2FA:** authenticator apps (TOTP), passkeys (WebAuthn) and recovery codes. Never SMS.

## Alternatives considered

- **JWTs stored in the browser:** readable by any injected script; sessions are safer for a web app.
- **Creating the user before verification:** allows pre-account takeover.
- **SMS codes:** vulnerable to SIM swapping.

## Consequences

- Cookie sessions require CSRF protection on all signed-in requests (added with sign-in).
- Local development uses Mailpit to receive emails; production needs a real email provider.
