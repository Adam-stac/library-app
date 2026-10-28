/*
 * Light or dark. By default the app follows the device (prefers-color-scheme); a reader can choose light or dark
 * instead, and the choice is kept on this device only, like the language. The choice is written to
 * <html data-theme="light|dark">, which index.css reads. public/theme.js does the same before the page first draws,
 * so a saved choice never flashes the other theme; it is a file, not an inline script, because the
 * Content-Security-Policy allows scripts from this site only.
 */

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** The same key public/theme.js reads */
export const THEME_STORAGE_KEY = 'theme'

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

/** The saved choice; "system" when there is none, or when storage is blocked (private mode). */
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Shows the theme at once and remembers it on this device. */
export function chooseTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage unavailable: the choice holds until the page is closed.
  }
}
