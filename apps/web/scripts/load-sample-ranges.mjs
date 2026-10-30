// Loads the made-up sample ISBN ranges (apps/api/src/test/resources/isbn/sample-ranges.xml) into the running stack's
// database, through the same import command an administrator runs with the real file (docs/operations/isbn-ranges.md).
// The browser tests need it to see a publisher filled in. It replaces any ranges already loaded in that database.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const file = fileURLToPath(new URL('../../api/src/test/resources/isbn/sample-ranges.xml', import.meta.url))
const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex')

execFileSync(
  'docker',
  [
    'compose',
    'run',
    '--rm',
    '--no-deps',
    '-v',
    `${file}:/import/RangeMessage.xml:ro`,
    'api',
    '--import.isbn-ranges.file=/import/RangeMessage.xml',
    `--import.isbn-ranges.sha256=${sha256}`,
  ],
  { cwd: root, stdio: 'inherit' },
)
