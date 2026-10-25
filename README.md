# Khizāna (خِزانة)

A personal digital library for cataloguing physical books, starting with classical Islamic works: authors, their biographies, birth and death years, birthplaces, and the books you own. Arabic is the primary language, English secondary.

## Principles

- **The user enters the data.** You have the book in hand; the app gives clear, guided forms.
- **Test-gated.** No feature is finished until its automated tests pass in CI.
- **Only green code ships.** Merges to `main` deploy only when every check passes.
- **Secure by default.** Security is part of every phase, not a final step. See [SECURITY.md](SECURITY.md).

## Repository layout

```
apps/
  api/        Spring Boot REST API (Java 25), modular monolith      (Phase 2)
  web/        React + TypeScript + Vite front end                    (Phase 2)
packages/     Shared code: generated API client, types               (Phase 2)
docs/
  adr/        Architecture Decision Records
```

## Prerequisites

Git, gitleaks, Java 25 (Temurin), Node.js 24 LTS (via fnm), pnpm, Docker Desktop.

## First-time setup

```bash
git clone git@github.com:<you>/library-app.git
cd library-app
pnpm install          # installs commit tooling
pnpm exec lefthook install   # turns on the git hooks
```

Every commit is then checked for secrets (gitleaks) and for a Conventional Commit message (commitlint).

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md): short-lived branches, Conventional Commits, signed commits, and pull requests into a protected `main`.

## Decisions

Significant decisions are recorded in [docs/adr](docs/adr).

## Run the whole app locally

```bash
cp .env.example .env    # then set POSTGRES_PASSWORD (openssl rand -base64 24)
docker compose up -d --build
```

Open http://localhost:3000. Stop with `docker compose down` (add `-v` to delete the local database).
