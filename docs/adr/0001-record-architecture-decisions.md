# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Decisions about the stack, structure and security get made once and then forgotten. Months later it is unclear why something was chosen, or whether it is safe to change.

## Decision

Record every significant decision as a short Architecture Decision Record (ADR) in `docs/adr`, numbered in order, using `0000-template.md`. ADRs are never edited after acceptance; a new ADR supersedes an old one.

## Alternatives considered

- Keeping decisions only in a planning document: easy to lose touch with the code.
- No record: decisions get re-argued or silently reversed.

## Consequences

A small amount of writing per decision, in exchange for a clear history that lives next to the code.
