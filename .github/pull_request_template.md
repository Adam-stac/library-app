## What and why

<!-- One or two sentences: what this changes and why. -->

## Type

- [ ] Feature
- [ ] Fix
- [ ] Security
- [ ] Chore / CI / docs

## Checklist

- [ ] Tests added or updated, and passing locally
- [ ] Access control tested (users can't reach each other's data), if this touches data
- [ ] Works in Arabic (RTL) and English (LTR), if this touches the UI
- [ ] Database changes are a new Flyway migration, never an edit to an old one
- [ ] No secrets, tokens or personal data in code, tests or logs
- [ ] ADR added in `docs/adr` if this is a significant decision

## Security considerations

<!-- What could go wrong with this change, and how is it prevented? Write "None" only if it truly touches nothing sensitive. -->
