# 0008. Design system, the خِزانة mark, and no dead ends

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The backend is complete (slices 9 to 16b). The interface is built next, one area at a time (roadmap, Phase B).
The app is named **Khizāna (خِزانة)**, the room or cabinet where a scholar kept their books. The owner asked for a
look that is minimal, modern and calm, unlike the cream, clay and serif style common in generated web apps, and
for one firm rule: nothing on screen may be a placeholder. Every button and link must work, end to end.

## Decision

- **Tokens, not one-off colours.** Colours are named for their job (`paper`, `surface`, `ink`, `muted`, `line`,
  `accent`, `danger`…) in `src/index.css`, with a light and a dark set that follow the device's setting. The greys
  carry a trace of the accent's green (no cream). One accent: deep green (`#1D5C4E`, `#7CC4AD` in dark mode).
  Every text colour is at least 6:1 against its background in both sets, and input borders at least 3:1 (WCAG 2.2
  AA asks for 4.5:1 and 3:1).
- **A few shared classes** (`page-title`, `section-title`, `lede`, `label`, `btn`, `btn-primary`, `btn-ghost`,
  `btn-danger`, `link`, `back-link`, `field`, `card`, `notice`, `font-book`) instead of long lists of utilities
  repeated on every page, so a change of style is made once.
- **Two voices in the type, all bundled with the app** (the Content-Security-Policy only allows fonts from our
  own site; all under the SIL Open Font License):
  - the interface speaks in Geist (Latin) and Readex Pro (Arabic): clear and modern;
  - **words from the library itself** (authors' names, titles, biographies, benefits) are set in **Lateef**, a
    naskh drawn by SIL, wherever they appear, including while they are typed. Lateef is small for its size, so its
    `@font-face` scales it up (`size-adjust: 160%`) to sit level with the interface text, and it loads only for
    Arabic letters (Latin letters in the same text fall back to Geist). Two weights, about 60 kB each, fetched only
    on pages that show Arabic library text.
- **Lists read like a book's index.** Authors are listed by name in Lateef, with the year of death at the end of
  the line as classical books cite scholars ("ت ٢٥٦هـ", "d. 256 AH"), and grouped under the letter each name is
  filed under. The letter comes from `src/indexLetter.ts`, which repeats the database's catalogue order
  (`library_sort_key`, ADR 0006) exactly, so the groups match the order the API sends.
- **Icons from Lucide** (ISC License), copied in as inline SVG (`components/Icon.tsx`): a few icons, no extra
  dependency. Every icon sits beside a text label and is hidden from screen readers; arrows turn round on
  right-to-left pages.
- **The mark is a shape, not text.** خِزانة is drawn from Amiri Bold (a classical naskh, SIL Open Font License) by
  `apps/web/scripts/make-mark.py` and shown as an inline SVG: the same on every device, coloured by the theme, and
  without a 100 kB font download for one word. The favicon is its first letter, خ.
- **The frame.** Signed in: a sidebar on wide screens (a top bar with the sections in a row on phones) linking only
  to the areas that exist, the page you are on marked in the accent; each area is added when its pages are built.
  At its foot, the language and an **account menu** (the account's initial and email address; opening on the
  settings and signing out). **Frosted glass only where the page passes under something**: the phone's top bar and
  menus, tinted enough to keep text readable over anything, and solid when the device asks for less transparency.
  No background image: the identity is the mark and the type. Lists take the width beside the sidebar; forms and
  reading pages are narrower. Signed out: the mark, signing in and the language along the top, and the page in one
  centred column.
- **No dead ends, checked on every build** (`src/noDeadEnds.test.ts`):
  - every link and `navigate()` leads to an address that `App.tsx` has a page for; never `#`, `""` or
    `javascript:`;
  - every `<button>` says its type, and either submits a form or has an `onClick` that does something;
  - no text says "coming soon";
  - every text exists in both Arabic and English.
  An address with no page shows "Page not found", rather than quietly showing the home page.

## Alternatives considered

- **A component library** (for example a ready-made design kit): heavier, harder to make right-to-left, and it
  would look like every other app built with it.
- **Amiri as a web font for the mark:** about 100 kB for one word, and the mark would shift while it loads.
- **Amiri, Scheherazade New or Noto Naskh Arabic for library text:** compared side by side on a vowelled ḥadīth
  and a book title. The owner chose Lateef. Commercial book faces (Traditional Arabic, Lotus, Badr) can't be
  bundled.
- **An icon package** (such as `lucide-react`): one more dependency to keep up to date, for about fifteen icons.
- **Checking dead ends only in the end-to-end tests:** slower, and easy to miss a page; the source check is
  instant. The end-to-end tests still prove each page's actions reach the API.

## Consequences

- New pages use the tokens and classes; a colour written directly (for example `bg-stone-900`) stands out in
  review.
- The check reads source text, so links built in unusual ways (a variable holding an address) aren't seen; links
  are written as literals or simple templates so that they are.
- The index letter must change with `library_sort_key`: if the database's rules change, `indexLetter.ts` and its
  tests change in the same pull request.
- The name changed in the emails, the authenticator app entry (now "Khizana") and the passkey prompts. Codes
  already set up keep working; only the label is new.

## Update, 28 October 2026: the redesign's foundations (Phase B2, slice P1)

The owner approved a redesign, mocked up first (a slim rail, a frosted card on a faint colour wash, one deep green
card each page leads with, large figures, pill buttons, and the share of each science as a ring in a green scale).
This slice lays its foundations; the look itself arrives in later slices.

- **A type scale with named steps.** Every text size and line height is a named step (`text-reading`,
  `text-title`, `text-figure`…), never a one-off value such as `text-[1.0625rem]`. `src/typeScale.test.ts` fails
  the build on one.
- **Alexandria for Arabic headings and large figures** (`font-display`), bundled like the other fonts. IBM Plex
  Sans Arabic was in the mockup for interface text, but three static weights are about 130 kB against Readex Pro's
  23 kB for the same job, so Readex Pro stays.
- **Light, dark, or as the device is set**, chosen in Settings and kept on the device. `public/theme.js` applies it
  before the page first draws, so a choice never flashes the other theme; it is a file, not an inline script,
  because the Content-Security-Policy allows scripts from this site only. The dark colours appear twice in
  `index.css` (for the device's setting and for the reader's choice); a test keeps the two the same.
- **New tokens:** fields, progress tracks, dark pills, the frosted card, the deep focal card, shadows, rounder
  corners (`rounded-field`, `-panel`, `-card`, `-frame`), the wash, and a six-step green scale from most to least.
  `src/colours.test.ts` checks every text pair is at least 4.5:1 and field borders 3:1, in light and dark,
  against every colour stop of a gradient.
- **No layout shift on load.** Measured on a slow connection (150 ms latency, 1.6 Mbit/s), signed-in pages moved by
  0.17 (0.53 on an Arabic book page; Google counts over 0.1 as needing improvement): the signed-out frame was drawn
  first, then swapped for the sidebar, and book titles rewrapped when Lateef arrived. Now the frame stays hidden
  until the app knows who is signed in, the fonts nearly every page uses are preloaded, and Latin text waits in
  Arial resized to Geist's measurements. Measured again: 0 on every page tried.

## Update, 28 October 2026: a safety net before the look changes (slice P2)

- **Every axe check runs in light and dark** (`e2e/accessibility.ts`), with motion reduced so no colour is caught
  mid-transition. Every spec uses the one helper.
- **The library in Arabic, end to end** (`e2e/arabic.spec.ts`): add a book, keep your place, save a benefit, find
  both by searching, and choose dark, using the Arabic texts from `ar.json`, so a renamed text breaks the test, not
  the reader. The other library journeys stay in English.
- **The end-to-end tests are type-checked** with the rest (`tsconfig.e2e.json`).
- **Each page is its own file**, fetched when first opened and the rest fetched once the app is idle; the home page
  comes with the frame. A first visit now downloads 133 kB of script instead of 165 kB.
- **Lateef is no longer preloaded.** On a slow connection it held the first page back by half a second. A book's
  page moved by 0.18 when it arrived (its actions rewrapped beside the title), so on such pages the actions now sit
  on the row of the way back, above the title. Layout shift is 0 on every page measured, and the end-to-end tests
  check it on the landing page and on the home page in Arabic.
- **A size budget** (`scripts/check-bundle-size.mjs`, run in CI after the build): first-visit scripts, styles,
  preloaded fonts and the largest page each have a ceiling; raising one is a decision made in the pull request.

## Update, 28 October 2026: the new frame (slice P3)

- **Wide screens:** a slim rail (the mark, every section as an icon over its name, the language and the account at
  its foot), and the page on a frosted card (`frame-card`, solid when the device asks for less transparency) over
  the colour wash.
- **Phones:** the mark, the language and the account in a frosted bar along the top; along the bottom a search box
  (not on the search page itself) and a tab bar with Home, Books, Benefits and Authors, and "More" for Places,
  Sciences and Settings. The rail and the tab bar are one list of links laid out two ways, so the sections are in
  the page once.
- **Shared pieces:** buttons are pills at least 44 px tall (the main action a dark pill), fields are softer and
  48 px tall, cards rest on a shadow (with an edge in dark), views of a list are a row of pills (`tabs`, `tab`),
  page titles are larger, and lists read like an index on a card. Every page takes these on without changes of its
  own.

## Update, 29 October 2026: the home page (slice P4)

The home page now leads with one thing: the book you're reading, in the deep focal card, with the page you're on
as the one large figure and a ruler through its volumes (a plain bar past 24 volumes). The figure is decoration;
the same place is written out in words for screen readers. Beside it: the other books you're reading, the ones
bought but not started, and the ones gone quiet. Below: the sciences as a ring in a scale of greens, deepest for
the largest share (up to six slices; past five sciences, the rest are put together), with a key that carries the
numbers; this year as large figures; and the latest benefits. A search box sits under the greeting on a wide
screen (a phone has one at the foot of the screen). No API change: it is all from `GET /api/v1/home`.
