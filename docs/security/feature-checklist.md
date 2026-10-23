# Feature security checklist

Every feature pull request must satisfy all of this before merging. "Doesn't apply" is allowed only with a one-line reason in the pull request.

## Before writing code
- [ ] Acceptance criteria written (what a user can do, what they must not be able to do)
- [ ] Threat model in `docs/security/threat-models/<feature>.md`: STRIDE threats, each with its control and the test that proves it
- [ ] Relevant OWASP ASVS 5.0 (Level 2) chapters listed in the threat model
- [ ] Data handled: is it personal data? How long is it kept, and how is it deleted?

## Building
- [ ] Deny by default: new endpoints are closed until explicitly opened; data is always scoped to the signed-in user
- [ ] Every input validated (type, format, length) and request bodies size-limited
- [ ] Anything costly or abusable (emails, password hashing, searches) is rate-limited
- [ ] Calls to other services have timeouts and a safe behaviour when they fail
- [ ] Side effects (emails, external calls) happen only after the database transaction commits
- [ ] Errors return codes only; logs contain no passwords, tokens or personal data
- [ ] Database changes are new Flyway migrations; old ones are never edited
- [ ] Data that is no longer needed is deleted automatically

## Testing (see docs/TESTING.md)
- [ ] Unit tests for the rules
- [ ] Integration tests against real Postgres
- [ ] A security test for every threat in the threat model
- [ ] Hostile-input tests: random and malicious input never causes a 500 or leaks internals
- [ ] Adapters to other services tested against a fake server, including timeouts and failures
- [ ] UI: end-to-end tests in Arabic and English, desktop and mobile, with axe accessibility checks

## Review
- [ ] Re-read the change as an attacker: "how would I abuse this?"
- [ ] All CI checks green; any CodeQL or ZAP findings fixed or recorded with a reason
- [ ] SECURITY.md updated if the security posture changed
