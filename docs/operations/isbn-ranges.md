# Importing the ISBN ranges

The book form suggests a new copy's publisher and place from your other books by the same publisher (ADR 0010,
slice L2). To know which books share a publisher, the app needs the International ISBN Agency's ranges, which say
where each ISBN's country code and publisher's code end.

The Agency offers the file for use from its own site but does not allow republishing it, and this repository is
public. So the file is **never committed**. An administrator downloads it and loads it into the database with the
import below. `.gitignore` refuses the usual file names as a safety net.

Until the import has been run, the form still works: it suggests the language from the ISBN's country, and nothing
for the publisher or place. A code the Agency gave out after the loaded copy simply suggests nothing, never something
wrong, so re-running the import a few times a year is enough.

## Steps (local stack, from WSL)

1. Download the file from the Agency's site (their page: https://www.isbn-international.org/range_file_generation):

   ```
   curl -fsSL -o ~/RangeMessage.xml https://www.isbn-international.org/export_rangemessage.xml
   ```

2. Note its checksum. The import refuses any file that doesn't match it, so what is loaded is exactly what you
   downloaded:

   ```
   sha256sum ~/RangeMessage.xml
   ```

3. With the database running, run the import (one line; put the checksum from step 2 at the end):

   ```
   cd ~/projects/library-app
   docker compose up -d --wait db
   docker compose run --rm --no-deps -v ~/RangeMessage.xml:/import/RangeMessage.xml:ro api --import.isbn-ranges.file=/import/RangeMessage.xml --import.isbn-ranges.sha256=CHECKSUM
   ```

   Expected: a log line `ISBN ranges imported: release …, SHA-256 …, 287 groups, 1904 rules` (the numbers grow over
   time) and the command ends with exit code 0. If anything is wrong it says `ISBN ranges not imported, nothing was
   changed:` and why, and ends with exit code 1. The ranges already loaded stay as they were.

4. Delete the downloaded file: `rm ~/RangeMessage.xml`.

## On the server

Run the same image once, with the file mounted and the two arguments, against the production database (in Coolify,
a one-off command for the API service). The app starts, imports, logs the result and stops; the running API is not
touched. Never add the arguments to the API's normal start command.

## What the import checks

- The SHA-256 matches the one given.
- The file is at most 10 MB and is the Agency's range message.
- Its DTD only describes the file's own layout: no entities, no parameter entities, no outside DTD, and the parser
  loads nothing from outside the file.
- Every prefix, range and length has the shape the Agency documents; ranges don't overlap; a publisher's code always
  leaves room for the title.

It replaces the whole snapshot in one transaction and records which copy is loaded (serial number, date, checksum)
in `isbn_range_release`.
