# Security

Security is built into every phase of this project and measured against the OWASP Top 10:2025.

## Reporting a vulnerability

This is a private repository. If you find a security issue, contact the maintainer privately. Do not open a public issue or include exploit details in a pull request.

## Rules that always apply

1. **No secrets in Git.** Passwords, API keys, tokens and private keys never go into code, commits, Docker images or logs. Local values live in `.env` (git-ignored); only `.env.example` with placeholders is committed.
2. **Secrets are scanned on every commit** by gitleaks (local git hook), and again in CI.
3. **Commits are signed** with an SSH signing key registered on GitHub.
4. **`main` is protected.** Changes arrive only through pull requests with passing checks. No direct or force pushes.
5. **Least privilege everywhere.** CI jobs, database users and server accounts get only the access they need.
6. **Two-factor authentication** (passkey or authenticator app) on every account connected to this project: GitHub, VPS provider, Coolify, Cloudflare, Sentry, domain registrar.
7. **Dependencies are kept current** by Dependabot and scanned for known vulnerabilities.

## If a secret leaks

1. **Revoke or rotate it immediately** at the service that issued it. Assume it is compromised the moment it is pushed, even if the commit is removed.
2. Remove it from the code and replace it with an environment variable.
3. Check logs and access history at the affected service.
4. Record what happened and what changed in `docs/`.

## Security by phase

| Phase | Security built in |
| --- | --- |
| 1 Foundations | Account 2FA and passkeys, password manager, hidden email, signed commits, gitleaks pre-commit hook, protected `main`, Dependabot alerts, read-only Actions permissions |
| 2 Skeleton | Spring Security deny-by-default baseline, security headers, CORS locked down, safe error responses, non-root containers, base images pinned by digest, no secrets in Compose files |
| 3 Pipeline & infrastructure | gitleaks, Semgrep, Dependency-Check, Trivy, SBOM and OWASP ZAP in CI; actions pinned to SHAs; protected deploy environment; hardened server, private database, encrypted backups, HTTPS + HSTS |
| 4 Features | Threat model per feature, input validation, access-control tests proving users can't reach each other's data, rate-limited login, rotating refresh tokens, audit logging |
| 5 Later | Map API tokens restricted to our domain; bot webhook secret verification and one-time account-linking codes; mobile tokens in secure storage; WhatsApp and app-store credentials in protected secrets |
