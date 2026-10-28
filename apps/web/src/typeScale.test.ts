/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest hands CSS imports to tests empty, even with ?raw
const css = readFileSync('src/index.css', 'utf8') // tests run from apps/web

/*
 * Every text size and line height is a step on the type scale in index.css, named by its job (ADR 0008). A one-off
 * value such as text-[1.0625rem] drifts from the scale and is hard to change later, so these checks fail the build
 * on one, in any page, component or the stylesheet. Layout values (grid columns, widths) are not type, so they are
 * left alone.
 */

const sources = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** A size or line height written as a bare value, such as text-[17px], text-[1.0625rem] or leading-[1.85] */
const ONE_OFF = /\b(?:text|leading)-\[[\d.]+(?:rem|px|em|%)?\]/g

describe('the type scale', () => {
  it('has no one-off text sizes or line heights in pages and components', () => {
    const found = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(ONE_OFF)].map((match) => `${file}: ${match[0]}`),
    )
    expect(found).toEqual([])
  })

  it('has none in the stylesheet either', () => {
    expect(css).toContain('--text-reading') // the stylesheet really was read
    expect(css.match(ONE_OFF) ?? []).toEqual([])
  })

  it('catches a one-off value', () => {
    expect('font-book text-[1.0625rem] leading-[1.85] grid-cols-[4rem_1fr]'.match(ONE_OFF)).toEqual([
      'text-[1.0625rem]',
      'leading-[1.85]',
    ])
  })
})
