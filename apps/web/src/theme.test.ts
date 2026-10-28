/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseTheme, savedTheme } from './theme'

// Read from disk, from apps/web where the tests run: Vitest hands CSS imports to tests empty
const css = readFileSync('src/index.css', 'utf8')
const earlyScript = readFileSync('public/theme.js', 'utf8')

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('the theme', () => {
  it('follows the device until a reader chooses', () => {
    expect(savedTheme()).toBe('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('shows a chosen theme at once and remembers it on this device', () => {
    chooseTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(savedTheme()).toBe('dark')

    chooseTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('goes back to following the device, forgetting the choice', () => {
    chooseTheme('dark')
    chooseTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('theme', 'purple')
    expect(savedTheme()).toBe('system')
  })

  it('still works when storage is blocked, as in private mode', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(savedTheme()).toBe('system')
    chooseTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('public/theme.js, which runs before the page first draws', () => {
  const run = () => new Function(earlyScript)()

  it('applies a saved choice', () => {
    localStorage.setItem('theme', 'dark')
    run()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('leaves the device setting alone when nothing, or something unknown, is saved', () => {
    run()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    localStorage.setItem('theme', '"><script>')
    run()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('does not break the page when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(run).not.toThrow()
  })
})

describe('the dark colours in index.css', () => {
  it('are the same whether the device asks for dark or the reader chose it', () => {
    const inMediaQuery = css.match(/:root:not\(\[data-theme='light'\]\) \{([^}]*)\}/)?.[1]
    const chosen = css.match(/:root\[data-theme='dark'\] \{([^}]*)\}/)?.[1]
    const declarations = (block?: string) =>
      (block ?? '')
        .split(';')
        .map((declaration) => declaration.replace(/\s+/g, ' ').trim()) // the blocks are indented differently
        .filter(Boolean)
    expect(declarations(inMediaQuery).length).toBeGreaterThan(10)
    expect(declarations(chosen)).toEqual(declarations(inMediaQuery))
  })
})
