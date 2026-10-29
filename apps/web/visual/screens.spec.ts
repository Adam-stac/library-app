import { expect, test } from '@playwright/test'
import { PAGES, settled, useLibrary } from './library'

/*
 * Screenshots of every page, compared with the approved ones in visual/screenshots/: a change to how a page looks
 * fails the check until the new picture is approved, so nothing changes by accident. Taken in Playwright's own
 * Linux image (the same in CI and on your machine, pnpm visual:docker), because fonts are drawn slightly
 * differently on each system. On a wide screen in Arabic (light) and English (dark), the whole page; on a phone in
 * Arabic, the first screen.
 */

const VARIANTS = [
  { language: 'ar', scheme: 'light', projects: ['desktop', 'phone'] },
  { language: 'en', scheme: 'dark', projects: ['desktop'] },
] as const

for (const { language, scheme, projects } of VARIANTS) {
  test.describe(`${language}, ${scheme}`, () => {
    for (const { name, path, signedIn } of PAGES) {
      test(name, async ({ page }) => {
        test.skip(!(projects as readonly string[]).includes(test.info().project.name), 'not drawn on this device')
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await useLibrary(page, { signedIn, language })
        await page.goto(path)
        await settled(page)
        // The whole page on a wide screen; on a phone, the screen as it is seen, since its bars are fixed to the
        // screen and a picture of the whole page would draw them half way down it
        const fullPage = test.info().project.name !== 'phone'
        await expect(page).toHaveScreenshot(`${name}-${language}-${scheme}.png`, { fullPage })
      })
    }
  })
}
