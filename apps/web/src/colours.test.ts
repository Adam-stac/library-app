/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Every pair of colours the app draws text with passes WCAG 2.2 AA: 4.5:1 for text, 3:1 for the borders that show
 * where a field is. Read from the tokens in index.css, in light and in dark, so changing a colour can't quietly
 * break a pair. Gradients are checked against each of their colour stops, so text on them passes everywhere.
 */

const css = readFileSync('src/index.css', 'utf8') // tests run from apps/web

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.replace(/\s+/g, ' ')]),
  )
}

const light = tokens(css.match(/:root \{([^}]*)\}/)?.[1] ?? '')
const dark = { ...light, ...tokens(css.match(/:root\[data-theme='dark'\] \{([^}]*)\}/)?.[1] ?? '') }

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** The solid colours a token draws with: itself, or every #rrggbb stop of a gradient */
const solids = (value: string) => value.match(/#[0-9a-f]{6}/gi) ?? []

const TEXT: [string, string][] = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['muted', 'paper'],
  ['muted', 'surface'],
  ['muted', 'field'],
  ['muted', 'hover'],
  ['ink', 'wash'],
  ['muted', 'wash'],
  ['accent', 'surface'],
  ['accent', 'paper'],
  ['accent', 'accent-soft'],
  ['on-accent', 'accent'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['on-danger', 'danger'],
  ['on-chip', 'chip'],
  ['focal-ink', 'focal'],
  ['focal-muted', 'focal'],
  ['focal-deep', 'focal-ink'],
]
const BORDERS: [string, string][] = [
  ['line-strong', 'surface'],
  ['line-strong', 'field'],
  ['line-strong', 'paper'],
]

describe.each([
  ['light', light],
  ['dark', dark],
])('colours in %s', (_, theme) => {
  it.each(TEXT)('%s text on %s is at least 4.5:1', (fore, back) => {
    expect(solids(theme[back]).length).toBeGreaterThan(0)
    for (const behind of solids(theme[back])) {
      expect(contrast(theme[fore], behind), `${fore} on ${back} (${behind})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(BORDERS)('a %s border on %s is at least 3:1', (fore, back) => {
    expect(contrast(theme[fore], theme[back])).toBeGreaterThanOrEqual(3)
  })
})
