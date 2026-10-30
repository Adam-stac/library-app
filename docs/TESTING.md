# Testing standard

A feature is finished only when every relevant layer below is tested and CI is green.

| Layer | Proves | Tools |
| --- | --- | --- |
| Unit | Rules and calculations are correct | JUnit 5, AssertJ / Vitest |
| Integration | Data is stored and constrained correctly in a real database | Testcontainers (Postgres 18) |
| API | Endpoints return the right status codes and error codes | Spring Boot tests over real HTTP |
| Security | Every threat in the feature's threat model is blocked | Spring Boot tests, one or more per threat |
| Hostile input | Random and malicious input never causes a 500 or leaks internals | Seeded randomised tests |
| Adapters | Integrations with other services behave on success, failure and timeout | Fake servers (JDK HttpServer), Mailpit container |
| Architecture | Modules don't reach into each other | Spring Modulith |
| Component | Screens behave correctly in Arabic and English | Vitest, React Testing Library |
| End-to-end | Real journeys work in a real browser, RTL and LTR, desktop and mobile | Playwright |
| Accessibility | WCAG 2.2 AA | axe-core; reflow and text-spacing checks; by hand ([checklist](testing/manual-checklist.md)) |
| Visual | Nothing changes how a page looks by accident | Playwright screenshots, in Playwright's Linux image |
| Dynamic security | The running app resists common attacks | OWASP ZAP |
| Logs | No query string (search text, an ISBN) reaches the web server's access log | A CI step over the web container's log, after the browser tests and the ZAP scan |

## Rules
- **No automatic retries.** A flaky test is fixed straight away, never retried until it passes.
- **Random tests use a fixed seed**, so any failure can be reproduced exactly.
- **Tests never call real outside services.** They use fakes, fake servers or containers.
- **Each test cleans up after itself** and doesn't depend on other tests running first.

## Library tests (authors, places, works and editions)
- **`ApiBrowser`** (in `src/test/java/.../libraryapp`) creates a new account, signs in and keeps cookies like the
  web app. `anotherDevice()` signs the same account in again. Each test makes its own accounts, so tests never
  share data. Library test classes all use `properties = ApiBrowser.MANY_SIGN_INS`, so they share one Spring
  context and one database.
- **`CrossUserAccess.assertInvisible`** is the access-control check every library record type must pass: a second
  account reads, edits and deletes the record by its ID, and must get the same 404 as for an ID that doesn't
  exist.
- Each record type also has a hostile-input class (random and malformed bodies never give a 500).
- The shared starter list of places is loaded by a migration, so it is in every test database. Tests find a shared
  place by its English name (for example `Makkah`) and never change the list.

## Browser tests against the full stack (`apps/web/e2e/`)
- Start the stack, load the made-up sample ISBN ranges, then run the tests:
  `docker compose up -d --build --wait && pnpm --filter @library-app/web e2e:ranges && pnpm --filter @library-app/web e2e`.
- `e2e:ranges` loads `apps/api/src/test/resources/isbn/sample-ranges.xml` through the same import command an
  administrator runs with the real file (docs/operations/isbn-ranges.md), so CI proves the command works too. It
  replaces whatever ranges that database had; the real file is never in the repository.
- The API tests load the same sample with `SampleIsbnRanges.load(context)` before each test that needs it.

## No dead ends
- **`src/noDeadEnds.test.ts`** (web) reads every page and component and fails on a link to an address with no page,
  a button that does nothing, a "coming soon" text, or a text missing from Arabic or English (ADR 0008). It runs
  with the other web tests, so CI fails before a placeholder can be merged.

## Screenshots and reflow (`apps/web/visual/`)
- **The built app with a fixed library**: the API is answered in the browser from `visual/library.ts`, and the clock
  is fixed at 28 October 2026, so every run draws exactly the same pages. No server or database is needed.
- **Reflow** (`reflow.spec.ts`, WCAG 1.4.10 and 1.4.12): every page, in Arabic and English, at 320 px wide (a phone,
  or 400% zoom), at 200% zoom, and at 320 px with wider line, letter, word and paragraph spacing, must not scroll
  sideways. When it fails, it names the elements that stick out. Run anywhere: `pnpm --filter @library-app/web build`
  then `pnpm --filter @library-app/web visual -g Reflow`.
- **Screenshots** (`screens.spec.ts`): 16 pages on a wide screen in Arabic (light) and English (dark), and on a
  phone in Arabic, compared with the approved pictures in `visual/screenshots/`. Fonts are drawn slightly
  differently on every system, so screenshots are only taken and compared in Playwright's own Linux image: in CI
  (the `visual` job), and on your machine with Docker:
  - `pnpm --filter @library-app/web visual:docker` checks them;
  - `pnpm --filter @library-app/web visual:docker --update-snapshots` approves new ones after a change you meant.
    Look at each changed picture before committing it; the pull request shows them side by side.
- When CI's `visual` job fails, its `visual-differences` download has the expected, actual and difference images.
- Upgrading Playwright means updating the image in `ci.yml` (the job checks the two match) and approving new
  screenshots, since a new browser can draw a little differently.

## Coming next
- Mutation testing (PIT), nightly: proves the tests would catch real bugs
- ZAP active scan of the API from its OpenAPI description
