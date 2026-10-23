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

## Coming next
- Mutation testing (PIT), nightly: proves the tests would catch real bugs
- ZAP active scan of the API from its OpenAPI description
