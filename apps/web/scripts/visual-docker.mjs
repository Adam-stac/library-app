// Runs the screenshot and reflow tests in Playwright's own Linux image, the same one CI uses, so screenshots taken
// here match CI's pixel for pixel. Needs Docker. Any arguments go to Playwright, such as --update-snapshots to
// approve new screenshots: node scripts/visual-docker.mjs --update-snapshots
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = pkg.devDependencies['@playwright/test']
const image = `mcr.microsoft.com/playwright:v${version}-noble`
const root = fileURLToPath(new URL('../../..', import.meta.url))
// As you, so the files it writes (the build, new screenshots) are yours, not root's
const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid()}`] : []

console.log(`Running in ${image}`)
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    ...user,
    '-e',
    'HOME=/tmp',
    '-e',
    'CI=',
    '-v',
    `${root}:/work`,
    '-w',
    '/work/apps/web',
    image,
    'sh',
    '-c',
    `npx vite build && npx playwright test -c playwright.visual.config.ts ${process.argv.slice(2).join(' ')}`,
  ],
  { stdio: 'inherit' },
)
