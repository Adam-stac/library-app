# Security

Security is built into every phase of this project. We measure against the OWASP Top 10:2025 and target **OWASP ASVS Level 2** (Application Security Verification Standard): each feature is checked against the relevant ASVS requirements, and those checks become automated tests.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead: **Security tab → Report a vulnerability**. You'll get a reply as soon as possible, and fixes will be credited if you wish.

## Rules that always apply

1. **No secrets in Git.** Passwords, API keys, tokens and private keys never go into code, commits, Docker images or logs. Local values live in `.env` (git-ignored); only `.env.example` with placeholders is committed.
2. **Secrets are scanned** on every commit by gitleaks (local hook), by GitHub push protection, and again in CI.
3. **Commits are signed** with an SSH signing key registered on GitHub.
4. **`main` is protected.** Changes arrive only through pull requests with passing checks. No direct or force pushes.
5. **Least privilege everywhere.** CI jobs, database users and server accounts get only the access they need.
6. **Two-factor authentication** on every account connected to this project.
7. **Dependencies are kept current** by Dependabot and scanned for known vulnerabilities.

## If a secret leaks

1. **Revoke or rotate it immediately** at the service that issued it. Assume it is compromised the moment it is pushed: this repository is public.
2. Remove it from the code and replace it with an environment variable.
3. Check logs and access history at the affected service.
4. Record what happened and what changed in `docs/`.

## OWASP Top 10:2025 status

| Risk | In place | Planned |
| --- | --- | --- |
| A01 Broken Access Control | Deny-by-default API, tested; each user's authors scoped to their account, with cross-user access tests | The same for places, works and editions |
| A02 Security Misconfiguration | Security headers, no CORS, only health endpoint exposed, safe errors, tested | Non-root containers, pinned images (Phase 2); server hardening (Phase 3) |
| A03 Software Supply Chain Failures | Dependabot, lockfiles, pinned Postgres, signed commits | Dependency and image scanning, SBOM, actions pinned to SHAs (Phase 3) |
| A04 Cryptographic Failures | No secrets in code or config | HTTPS + HSTS, Argon2id passwords, encrypted backups (Phases 3–4) |
| A05 Injection | JPA with parameterised queries | Validation on all input; static analysis in CI (Phases 3–4) |
| A06 Insecure Design | Threat model required per feature | Rate limiting; abuse cases as tests (Phase 4) |
| A07 Authentication Failures | No login surface yet | Token-based login, rate limiting, rotating refresh tokens (Phase 4) |
| A08 Software or Data Integrity Failures | Signed commits, secret scanning | Deploy only CI-built images (Phase 3) |
| A09 Security Logging & Alerting Failures | Structured JSON logs in production | Security event logging, Sentry and uptime alerts (Phases 3–4) |
| A10 Mishandling of Exceptional Conditions | No stack traces or internals in responses, tested | Global error handler, timeouts, error-path tests (Phase 4) |
