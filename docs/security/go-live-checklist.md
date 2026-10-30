# Go-live checklist

Nothing is deployed to a public server until every box below is ticked, each with a pull request or a note showing how it was checked.
Items come from the threat models in `docs/security/threat-models/` and the review of shortcuts taken for local testing.

## Must be done before the first public deployment

- [ ] **Real client IP behind the proxies.** The API rate-limits by client IP. Behind Coolify (and Cloudflare, if used), every request would otherwise appear to come from the proxy, so one attacker could block sign-in for everyone, and the landing page's timeline (`/api/v1/public/scholars`, 30 a minute per address) would run out for everyone at once. Take the IP only from the trusted proxy (Cloudflare `CF-Connecting-IP`, or nginx `real_ip` restricted to the proxy's addresses). *Check:* an end-to-end test proves that a client-supplied `X-Forwarded-For` or `CF-Connecting-IP` is ignored.
- [ ] **Production configuration, separate from `compose.yaml` and `compose.test.yaml`.** Those files are for local development and CI: they use a test inbox (Mailpit), and the test file raises the sign-in rate limit tenfold. *Check:* production uses its own configuration; CI already fails if the limit is raised anywhere but `compose.test.yaml`.
- [ ] **`APP_BASE_URL` set to the real production address** before anyone adds a passkey. Passkeys are bound to that domain (ADR 0005); changing it later makes every passkey stop working.
- [ ] **HTTPS everywhere, with HSTS.** Cookies are `Secure`, so sign-in needs HTTPS. Add `Strict-Transport-Security` at the edge (consider HSTS preload later). Only the edge proxy may set `X-Forwarded-Proto`; nginx must not pass on a client's value.
- [ ] **Real email provider with SPF, DKIM and DMARC.** Password reset and every security notice depend on email. Without these records, attackers can send convincing fake emails from our domain, and real ones land in spam. *Check:* a test message passes SPF, DKIM and DMARC.
- [ ] **Secrets in the platform, never in Git.** `POSTGRES_PASSWORD` and `TOTP_ENCRYPTION_KEY` live in Coolify secrets. The TOTP key is backed up somewhere separate and safe: losing it breaks every authenticator setup.
- [ ] **Least-privilege database users.** A migration user that owns the schema, and an application user that can only read and write rows. A hole in the app must not be able to drop tables.
- [ ] **A way for people to reach the administrator, and a privacy notice.** Account emails tell people to contact the site's administrator if their email was changed without them (there is no self-service undo yet). The privacy notice says what is stored, for how long (including in backups), and that deleting the account removes it.
- [ ] **Bot protection on registration and password reset.** Per-IP and per-address limits don't stop a botnet from making us email thousands of strangers (which gets the domain blacklisted). Add Cloudflare Turnstile to those forms.
- [ ] **Backups, encrypted and restore-tested.** Database backups encrypted at rest, kept off the server, with one test restore done before go-live.
- [ ] **Monitoring and alerts.** Uptime checks, plus alerts on spikes in failed sign-ins, lockouts and 5xx errors.
- [ ] **Terms of every book-data source re-read.** The licence table in ADR 0010 was read on 30 October 2026 and terms change. Before go-live, read each source in use again (Usul, Harvard, Library of Congress, BnF, Open Library, Google Books) and confirm the credits on the About page. Google Books must be reviewed again before anyone is charged. *Check:* the table shows a new date for every source in use, and a source whose terms can't be confirmed is switched off.

- [ ] **No query strings in the edge's logs either.** Our nginx log drops them (search text and ISBN checks travel there), but Coolify's proxy and Cloudflare, if used, keep logs of their own. *Check:* their access logs are off, drop the query string, or are kept for a short, stated time that the privacy notice names.
- [ ] **ISBN ranges imported on the server.** Without them the book form can't suggest a publisher from the reader's other books. *Check:* the import (`docs/operations/isbn-ranges.md`) logged "ISBN ranges imported" against the production database, and adding a second book from a publisher you own fills its name in. Note the date: re-run it a few times a year.
- [ ] **Barcode scanning on real phones.** A laptop webcam is too low-resolution and fixed-focus to read ISBN barcodes, so scanning was tested with a fake camera only. *Check:* on the live site, scanning a book's barcode fills in the ISBN on an iPhone (Safari) and an Android phone (Chrome), and the camera light goes off when the dialog closes.

## Accepted for now (recorded in the threat models)

- The breached-password check fails open if Have I Been Pwned is unreachable.
- Someone who knows a victim's email can lock the account for 15 minutes (the owner is emailed).
- An email change can't be undone by the owner alone; they're told at both steps and must contact the administrator.
- New-device emails go by device type ("Chrome on Windows"), which can be faked.
- Authenticator codes can be phished in real time; passkeys (slice 5) fix that.
- nginx's error log writes the full request line, query string included, when a request fails (for example while the API is down). Its format can't be changed, and hiding errors would make failures harder to fix. The access log, which has a line for every request, keeps no query strings.
- The rate limiter is in memory: it resets on restart and assumes a single API instance.
