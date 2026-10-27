import { describe, expect, it } from 'vitest'

/*
 * Files the browser receives as they are, without going through the build that strips comments: index.html and
 * everything in public/. A comment there is visible to anyone, and the OWASP ZAP scan in CI fails on one
 * (Information Disclosure - Suspicious Comments). Credits and notes belong in the source and the ADRs instead.
 */
const files = {
  ...import.meta.glob('../public/**/*', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../index.html', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

describe('files served as they are', () => {
  it('finds index.html and the favicon', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['../index.html', '../public/favicon.svg']))
  })

  for (const [file, text] of Object.entries(files)) {
    it(`${file} has no comments`, () => {
      expect(text).not.toMatch(/<!--|\/\*/)
    })
  }
})
