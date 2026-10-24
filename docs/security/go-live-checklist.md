# Go-live checklist

Nothing is deployed to a public server until every box below is ticked, each with a pull request or a note showing how it was checked.
Items come from the threat models in `docs/security/threat-models/` and the review of shortcuts taken for local testing.

## Must be done before the first public deployment

- [ ] **Real client IP behind the proxies.** The API rate-limits by client IP. Behind Coolify (and Cloudflare, if used), every request would otherwise appear to come from the proxy, so one attacker could block sign-in for everyone. Take the IP only from the trusted proxy (Cloudflare `CF-Connecting-IP`, or nginx `real_ip` restricted to the proxy's addresses). *Check:* an end-to-end test proves that a client-supplied `X-Forwarded-For` or `CF-Connecting-IP` is ignored.
- [ ] **Production configuration, separate from `compose.yaml` and `compose.test.yaml`.** Those files are for local development and CI: they use a test inbox (Mailpit), and the test file raises the sign-in rate limit tenfold. *Check:* production uses its own configuration; CI already fails if the limit is raised anywhere but `compose.test.yaml`.
- [ ] **`APP_BASE_URL` set to the real production address** before anyone adds a passkey. Passkeys are bound to that domain (ADR 0005); changing it later makes every passkey stop working.
- [ ] **HTTPS everywhere, with HSTS.** Cookies are `Secure`, so sign-in needs HTTPS. Add `Strict-Transport-Security` at the edge (consider HSTS preload later). Only the edge proxy may set `X-Forwarded-Proto`; nginx must not pass on a client's value.
- [ ] **Real email provider with SPF, DKIM and DMARC.** Password reset and every security notice depend on email. Without these records, attackers can send convincing fake emails from our domain, and real ones land in spam. *Check:* a test message passes SPF, DKIM and DMARC.
- [ ] **Secrets in the platform, never in Git.** `POSTGRES_PASSWORD` and `TOTP_ENCRYPTION_KEY` live in Coolify secrets. The TOTP key is backed up somewhere separate and safe: losing it breaks every authenticator setup.
- [ ] **Least-privilege database users.** A migration user that owns the schema, and an application user that can only read and write rows. A hole in the app must not be able to drop tables.
- [ ] **Bot protection on registration and password reset.** Per-IP and per-address limits don't stop a botnet from making us email thousands of strangers (which gets the domain blacklisted). Add Cloudflare Turnstile to those forms.
- [ ] **Backups, encrypted and restore-tested.** Database backups encrypted at rest, kept off the server, with one test restore done before go-live.
- [ ] **Monitoring and alerts.** Uptime checks, plus alerts on spikes in failed sign-ins, lockouts and 5xx errors.

## Accepted for now (recorded in the threat models)

- The breached-password check fails open if Have I Been Pwned is unreachable.
- Sessions end after 12 hours idle, with no absolute lifetime yet; "active sessions" and a security event log arrive in slice 6.
- Someone who knows a victim's email can lock the account for 15 minutes.
- Authenticator codes can be phished in real time; passkeys (slice 5) fix that.
- The rate limiter is in memory: it resets on restart and assumes a single API instance.
