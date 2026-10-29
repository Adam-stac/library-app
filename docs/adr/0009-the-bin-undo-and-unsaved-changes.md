# 0009. The bin: undo deletes, and guard unsaved changes

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Phase B2 (slice P6) covers how the app behaves while things happen: loading, saving, leaving a form, and deleting.
Until now a book or a benefit was deleted for good after a "Yes, delete" question. Questions like that are
answered by habit, so they protect little, and a slip couldn't be put right. Deleting a book's last copy also
needed a second request from the browser to delete its work. Mail and document apps have settled on the better
pattern: act at once, then offer Undo, and keep what was deleted for a while.

## Decision

- **A bin.** Deleting a book (edition) or a benefit moves its row, as JSON, into a `bin` table (V17) and takes it
  out of its own table, so every list, search and count stays as it was. A book keeps its bookmark, the IDs of
  the benefits that named it, and, when it was the work's last copy and the request asked (`DELETE
  /api/v1/editions/{id}?withWork=ifLast`), its work with the work's authors in order. Without the parameter the
  work stays, as before.
- **Kept 30 days**, then deleted for good by a daily job (`BinService.deleteExpired`, 03:41). An item past its
  time is already out of reach. At most 20,000 items per account; past that the oldest go first.
- **Putting back** (`POST /api/v1/bin/{id}/restore`) restores the record with its own ID, version and dates, so
  links to it still work. A book's work comes from this item or from another copy of it in the bin (the last one
  deleted carries it); if the work was deleted for good, the answer is 409 `work_gone` and the book stays in the
  bin. A science or author deleted meanwhile is left out; benefits still without a book are linked back; a
  benefit's book is linked only if it is still there and still has the volume (otherwise its volume and page stay
  as a note, as when a book is deleted). The usual per-account limits apply.
- **Delete for good** (`DELETE /api/v1/bin/{id}`) and **Empty the bin** (`DELETE /api/v1/bin`) ask first, since
  they can't be undone. The bin is in Settings.
- **Undo in the app.** Deleting a book or benefit happens at once and says so in a message at the foot of the
  screen with Undo, for 10 seconds, waiting while the pointer or focus is on it. The message is read out
  politely and doesn't take focus. Timing is not essential (WCAG 2.2.1): the bin keeps the item for 30 days.
- **Authors, places and sciences** keep "Yes, delete": only unused ones can be deleted, and they hold little.
- **Unsaved changes.** The four library forms ask before leaving with changes not saved: the browser's own
  question for closing or reloading the tab, and a dialog (`<dialog>`, "Keep editing" focused) for links in the
  app. The app uses a declarative router, which can't block the browser's Back button; that is accepted.
- **Fields are checked when you leave them**, with the same rules as saving: a field you changed shows its problem
  on leaving, a problem put right goes at once, and fields only passed through wait for saving.
- **Loading and saving show.** Pages and lists show grey placeholder blocks after a quarter of a second (so quick
  answers never flash them), with "Loading…" for screen readers; buttons that are working are marked
  `aria-busy` and show a small turning ring.

## Consequences

- Deleted data is kept 30 days longer than before; the library threat model and the privacy notice say so.
- Restoring writes rows from JSON, so the bin's SQL lists each column explicitly; a new column on editions,
  works or benefits must be added to `BinService` too (its tests fail otherwise only if the column matters to
  them, so this is noted here and in the class).
- `DELETE /api/v1/works/{id}` still deletes for good; the web app no longer calls it.
