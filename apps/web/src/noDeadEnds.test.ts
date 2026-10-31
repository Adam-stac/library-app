import { describe, expect, it } from 'vitest'
import ar from './locales/ar.json'
import en from './locales/en.json'

/*
 * Nothing in the app is a placeholder (roadmap: "every button works end to end"). These checks read the source of
 * every page and component and fail the build on:
 *   - a link to an address the app has no page for (or to "#", "" or "javascript:"),
 *   - a button that does nothing: one without an onClick that isn't a form's submit button,
 *   - a "coming soon" text, and texts missing from one of the two languages.
 * They can't prove that every action reaches the API; the end-to-end tests do that for each page.
 */

const sources = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const routes = [...sources['./App.tsx'].matchAll(/<Route path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== '*')

/** True when the address is one of the app's pages (":id" stands for any one part of the address). */
function isAPage(address: string): boolean {
  const parts = address.split(/[?#]/)[0].split('/')
  return routes.some((route) => {
    const expected = route.split('/')
    return (
      expected.length === parts.length &&
      expected.every((part, i) => (part.startsWith(':') ? parts[i] !== '' : part === parts[i]))
    )
  })
}

/** Every address a file links or navigates to; parts worked out while running become "x". */
function addressesIn(source: string): string[] {
  const patterns = [
    /\bto="([^"]*)"/g,
    /\bto=\{'([^']*)'\}/g,
    /\bto=\{`([^`]*)`\}/g,
    /\bto:\s*'([^']*)'/g,
    /\bnavigate\(\s*'([^']*)'/g,
    /\bnavigate\(\s*`([^`]*)`/g,
    /\bhref="([^"]*)"/g,
  ]
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1].replace(/\$\{[^}]*\}/g, 'x')),
  )
}

/** The text of each <button ...> opening tag, ending at the first ">" outside braces. */
function buttonsIn(source: string): string[] {
  const buttons: string[] = []
  for (const start of source.matchAll(/<button\b/g)) {
    let depth = 0
    for (let i = start.index; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) {
        buttons.push(source.slice(start.index, i + 1))
        break
      }
    }
  }
  return buttons
}

describe('no dead ends', () => {
  it('finds the pages and components to check', () => {
    expect(routes.length).toBeGreaterThan(10)
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  for (const [file, source] of Object.entries(sources)) {
    it(`every link in ${file} leads to a page`, () => {
      for (const address of addressesIn(source)) {
        expect(address, `${file}: "${address}"`).not.toMatch(/^(#.*|javascript:.*|)$/i)
        if (address.startsWith('/')) expect(isAPage(address), `${file}: "${address}" is not a page`).toBe(true)
      }
    })

    it(`every button in ${file} does something`, () => {
      for (const button of buttonsIn(source)) {
        const submits = /type="submit"/.test(button)
        const acts = /\bonClick=\{/.test(button)
        expect(submits || acts, `${file}: ${button}`).toBe(true)
        expect(/type="(button|submit)"/.test(button), `${file}: a button must say its type: ${button}`).toBe(true)
        expect(button, `${file}: an onClick that does nothing`).not.toMatch(/onClick=\{\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\}/)
      }
    })
  }

  it('no text promises something that is not there', () => {
    const texts = [...allTexts(en), ...allTexts(ar)]
    for (const text of texts) {
      expect(text, text).not.toMatch(/coming soon|قريبًا|قريبا/i)
    }
  })

  it('every text the code asks for by name exists (a missing one would show its key, as "home.changePassword" did)', () => {
    const flat = new Set<string>()
    const walk = (texts: object, prefix: string) => {
      for (const [key, value] of Object.entries(texts)) {
        const name = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'object' && value !== null) walk(value, name)
        else flat.add(name)
      }
    }
    walk(en, '')
    // A plural is stored as key_one, key_other and so on; a list or a group as an object under the key
    const exists = (key: string) =>
      flat.has(key) || [...flat].some((name) => name.startsWith(`${key}_`) || name.startsWith(`${key}.`))
    const missing: string[] = []
    let asked = 0
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bt\('([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) {
        asked++
        if (!exists(match[1])) missing.push(`${file}: ${match[1]}`)
      }
    }
    expect(asked).toBeGreaterThan(300) // the check itself is finding the texts
    expect(missing).toEqual([])
  })

  it('every text exists in both Arabic and English', () => {
    // Arabic has more plural forms than English (_zero, _two, _few, _many), so those are compared without them
    const keysOf = (texts: object) =>
      new Set(allKeys(texts).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')))
    expect([...keysOf(ar)].sort()).toEqual([...keysOf(en)].sort())
  })
})

function allKeys(texts: object, prefix = ''): string[] {
  return Object.entries(texts).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? allKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function allTexts(texts: object): string[] {
  return Object.values(texts).flatMap((value) =>
    typeof value === 'object' && value !== null ? allTexts(value) : [String(value)],
  )
}
