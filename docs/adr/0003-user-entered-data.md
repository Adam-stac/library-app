# 0003. Users enter their own library data, with optional ISBN lookup

- **Status:** Accepted. The "look up by ISBN" decision is replaced by 0010; the rest stands.
- **Date:** 2026-10-21

## Context

Online catalogues (Open Library, Google Books, OpenITI, Wikidata) cover classical Islamic works poorly, especially Arabic editions. The user has the physical book in hand, and its title page, copyright page and the muhaqqiq's introduction hold the details needed. Many books, Arabic ones included, carry an ISBN (ردمك); many older prints and reprints do not.

## Decision

Users enter authors, places and books themselves through guided forms, and own their entries.

- Every edition has an optional ISBN field (ردمك), validated with the ISBN-10/13 check digit. It accepts Arabic-Indic digits (٠–٩) and stores standard digits.
- Every edition has an optional legal deposit number (رقم الإيداع), since many Arabic books carry one instead of, or alongside, an ISBN.
- A later feature adds "Look up by ISBN": the API fetches details from a fixed list of catalogue services (Open Library, Google Books) and pre-fills the form. Nothing is saved until the user reviews and confirms it.
- Books without an ISBN are entered by hand.
- A shared starter list of common historical places is the only pre-loaded data.

## Alternatives considered

- Automatic import with no review: catalogue data is often wrong or incomplete for this kind of book, and Arabic ISBNs are often missing from it.
- Manual entry only: slower for the books that do have an ISBN.
- Shared authors across users: raises the question of whose data wins, and one user's mistake would appear in everyone's library.

## Consequences

- The core app works with no external dependencies; ISBN lookup is an optional add-on.
- The lookup calls only fixed, allow-listed hosts, with timeouts and rate limits, and treats responses as untrusted input that is validated before it reaches the form.
- Every query is scoped to the logged-in user, enforced by access-control tests.
