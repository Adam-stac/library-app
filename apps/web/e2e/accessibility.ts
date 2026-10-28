import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { WCAG_AA } from './mailpit'

/**
 * Checks the page against WCAG 2.2 AA with axe, in light and then in dark: the two themes have different colours,
 * so a colour pair can pass in one and fail in the other. Motion is reduced while checking, so no colour is caught
 * halfway through a transition. The page is left as the device set it.
 */
export async function expectAccessible(page: Page, what = '') {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
    expect(results.violations, `${what} (${colorScheme})`.trim()).toEqual([])
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: null })
}
