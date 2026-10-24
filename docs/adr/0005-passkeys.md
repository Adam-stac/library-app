# 0005. Passkeys with webauthn4j behind our own endpoints

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

ADR 0004 commits to passkeys (WebAuthn) alongside passwords and authenticator apps. WebAuthn verification is
security-critical cryptography and must not be written by hand. Spring Security 7 ships passkey support, but it
expects its own sign-in flow: fixed URLs outside `/api` (which nginx doesn't forward), its own JSON responses, and a
`UserDetailsService`. Our sign-in has its own endpoints, CSRF header, rate limits, re-authentication for sensitive
changes, and security emails.

## Decision

Use **webauthn4j** (the library Spring Security itself uses for WebAuthn, pinned to the same version) for all
parsing and cryptographic checks, called from our own endpoints under `/api/v1/auth/passkeys`.

- Passkeys must be discoverable and must perform user verification (fingerprint, face or PIN).
- Signing in with a passkey completes sign-in on its own: it is phishing-resistant and multi-factor by itself
  (something you have, plus something you are or know), so it does not also ask for the password or an
  authenticator code.
- Adding or removing a passkey needs the password again; the owner is emailed either way.
- The site ID and allowed origin come from `APP_BASE_URL`, so passkeys work only on our own address.

## Alternatives considered

- **Spring Security's built-in passkeys:** less code, but would bypass our rate limits, re-authentication, emails
  and URL scheme, and would need nginx and session changes.
- **Hand-written WebAuthn verification:** rejected; parsing CBOR and checking signatures is exactly the kind of code
  that should come from a vetted library.

## Consequences

- One more dependency to keep patched (watched by Dependabot and Trivy).
- `APP_BASE_URL` must be the real production address before go-live, or passkeys created there won't work.
- Changing the site's domain later invalidates every passkey (WebAuthn binds them to the domain).
