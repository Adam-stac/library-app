# 0002. Modular monolith for the API

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The app has clear areas (authors, places, library, users, and later a quiz bot), one developer, and modest load. Microservices are the default in many tutorials, but they add network failures, distributed data, more deployments and service-to-service security.

## Decision

Build the API as one Spring Boot application, divided into modules by domain: `authors`, `places`, `library`, `users` (and later `quiz`). Each module owns its data and exposes a defined interface. Spring Modulith verifies the boundaries in a test that runs in CI, so the pipeline fails if one module reaches into another's internals.

The front end, database and (later) the quiz bot run as separate containers.

## Alternatives considered

- **Microservices from the start:** more operational and security overhead than one developer needs; joins across services for simple screens.
- **Unstructured monolith:** fastest at first, but modules become tangled and hard to extract later.

## Consequences

- One deployable API, one database, simple local development.
- Module boundaries are enforced by tests, so a module (most likely `quiz`) can later become its own service without a rewrite.
