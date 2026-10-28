import type { Page } from '@playwright/test'

type Watched = Window & { layoutShift?: number }
type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }

/**
 * From the next page loaded on, adds up how far things move without the reader doing anything: the browser's
 * cumulative layout shift. Google counts up to 0.1 as good.
 */
export async function watchLayoutShift(page: Page) {
  await page.addInitScript(() => {
    const watched = window as Watched
    watched.layoutShift = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShiftEntry[]) {
        if (!entry.hadRecentInput) watched.layoutShift = (watched.layoutShift ?? 0) + entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

/** The layout shift so far, once the fonts have arrived and the page has had a moment to settle. */
export async function layoutShift(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  return page.evaluate(() => (window as Watched).layoutShift ?? 0)
}
