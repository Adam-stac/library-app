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
| Accessibility | WCAG 2.2 AA | axe-core |
| Dynamic security | The running app resists common attacks | OWASP ZAP |

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

## No dead ends
- **`src/noDeadEnds.test.ts`** (web) reads every page and component and fails on a link to an address with no page,
  a button that does nothing, a "coming soon" text, or a text missing from Arabic or English (ADR 0008). It runs
  with the other web tests, so CI fails before a placeholder can be merged.

## Coming next
- Mutation testing (PIT), nightly: proves the tests would catch real bugs
- ZAP active scan of the API from its OpenAPI description
