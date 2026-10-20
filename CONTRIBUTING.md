# How we work

## Branches

- `main` is always deployable and protected. Nobody pushes to it directly.
- Work happens on short-lived branches, merged within a day or two:
  - `feat/authors-form`
  - `fix/hijri-date-validation`
  - `chore/update-dependencies`
  - `docs/adr-modular-monolith`

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org). A git hook rejects messages that don't follow it.

```
<type>(<optional scope>): <short summary in the imperative>
```

| Type | Use for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `test` | Adding or changing tests only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `chore` | Tooling, dependencies, config |
| `ci` | Pipeline changes |
| `security` | A security fix or hardening change |

Examples:

```
feat(authors): add form for kunya, laqab and nisba
fix(places): match Arabic names without diacritics
chore: add gitleaks pre-commit hook
```

All commits are signed (see the Phase 1 setup guide).

## The pull request flow

1. `git switch -c feat/your-change`
2. Commit in small steps. Each commit passes the local hooks.
3. `git push -u origin feat/your-change`
4. Open a pull request into `main` and fill in the template, including the security section.
5. Merge only when every check is green. Use **Squash and merge** so `main` keeps one clean commit per change.
6. Delete the branch.

## Definition of done (every feature)

- [ ] Acceptance criteria and a short threat model written first
- [ ] Unit and integration tests, including access-control tests
- [ ] Works in Arabic (RTL) and English (LTR)
- [ ] No secrets, no new warnings from the security scanners
- [ ] CI green, merged, live, and checked in production
