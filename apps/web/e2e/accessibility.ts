import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { WCAG_AA } from './mailpit'

/**
 * Checks the page against WCAG 2.2 AA with axe, in light and then in dark: the two themes have different colours,
 * so a colour pair can pass in one and fail in the other. Motion is reduced while checking, and the check waits for
 * the theme change to finish, so no colour is caught halfway through a transition. The page is left as the device
 * set it.
 */
export async function expectAccessible(page: Page, what = '') {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await themeChangeFinished(page)
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
    expect(results.violations, `${what} (${colorScheme})`.trim()).toEqual([])
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: null })
}

/**
 * Even with reduced motion, every colour moves to the new theme through a transition of 0.01ms (index.css), and a
 * transition only ends on a later frame. Checking before then can read a card's old background behind text already in
 * the new colour (seen on the authors timeline in CI). So: wait two frames for the transitions to start, then for all
 * of them to end.
 */
async function themeChangeFinished(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done))
    await frame()
    await frame()
    const running = document.getAnimations().filter((animation) => animation instanceof CSSTransition)
    await Promise.all(running.map((transition) => transition.finished.catch(() => undefined)))
  })
}
