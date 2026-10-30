// Fails the build when the app grows past its size budget, so a slow first visit is caught in review, not by readers.
// Sizes are as sent over the network (gzip). Run after `vite build`: node scripts/check-bundle-size.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist/', import.meta.url).pathname

// The budget, with a little room above today's sizes (28 October 2026: 133, 9 and 82 kB, and 11 kB for the
// largest page). Raise a number only on purpose, with the reason in the pull request.
const BUDGET = {
  firstVisitScripts: 145, // everything index.html asks for before the app can draw: the main file and its parts
  styles: 12,
  preloadedFonts: 90, // fonts are sent compressed already, so these are their file sizes
  largestPage: 20, // any one page's own file, fetched when it is first opened
  barcodeReader: 130, // the reader for browsers that can't scan by themselves, fetched only when Scan is pressed
}

const KB = 1024
const gzipped = (file) => gzipSync(readFileSync(join(DIST, file))).length / KB
const plain = (file) => readFileSync(join(DIST, file)).length / KB

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const linked = (pattern) => [...html.matchAll(pattern)].map((match) => match[1].replace(/^\//, ''))

const firstVisit = [
  ...linked(/<script type="module"[^>]* src="([^"]+)"/g),
  ...linked(/<link rel="modulepreload"[^>]* href="([^"]+)"/g),
]
const styles = linked(/<link rel="stylesheet"[^>]* href="([^"]+)"/g)
const fonts = linked(/<link rel="preload" href="([^"]+\.woff2)"/g)
// Each page's own file is named after it, such as assets/BookPage-1a2b3c.js
const pages = readdirSync(join(DIST, 'assets'))
  .filter((name) => /Page-[\w-]+\.js$/.test(name))
  .map((name) => `assets/${name}`)
  .filter((file) => !firstVisit.includes(file))

// The barcode reader is its own file (ADR 0010), named after its source, and loaded only on pressing Scan
const reader = readdirSync(join(DIST, 'assets'))
  .filter((name) => /^zxingDecoder-[\w-]+\.js$/.test(name))
  .map((name) => `assets/${name}`)

const sum = (files, size) => files.reduce((total, file) => total + size(file), 0)
const largest = pages.map((file) => [file, gzipped(file)]).sort((a, b) => b[1] - a[1])[0] ?? ['none', 0]

const rows = [
  ['Scripts on a first visit', sum(firstVisit, gzipped), BUDGET.firstVisitScripts, `${firstVisit.length} files`],
  ['Styles', sum(styles, gzipped), BUDGET.styles, `${styles.length} file`],
  ['Fonts preloaded', sum(fonts, plain), BUDGET.preloadedFonts, `${fonts.length} files`],
  ['Largest page', largest[1], BUDGET.largestPage, largest[0].replace(/^assets\//, '')],
]
if (reader.length > 0) {
  rows.push(['Barcode reader', sum(reader, gzipped), BUDGET.barcodeReader, reader[0].replace(/^assets\//, '')])
}

let over = false
for (const [name, size, budget, note] of rows) {
  const ok = size <= budget
  over ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(26)} ${size.toFixed(1).padStart(6)} kB of ${budget} kB  (${note})`)
}
if (firstVisit.length === 0 || pages.length === 0) {
  console.error('Could not find the built files: run `vite build` first.')
  process.exit(1)
}
if (over) {
  console.error(
    '\nOver the size budget. Make it smaller, or raise the budget on purpose in scripts/check-bundle-size.mjs.',
  )
  process.exit(1)
}
