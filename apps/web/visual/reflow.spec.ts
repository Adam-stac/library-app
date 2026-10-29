import { expect, type Page, test } from '@playwright/test'
import { MORE_PAGES, PAGES, settled, useLibrary } from './library'

/*
 * WCAG 2.2 AA, 1.4.10 Reflow and 1.4.12 Text Spacing: every page works at 320 CSS pixels wide (a phone, or a
 * desktop zoomed to 400%) and at 200% zoom, without scrolling sideways; and still does when the reader widens the
 * spacing of lines, letters, words and paragraphs. Layout only, so these run anywhere, not just in the image the
 * screenshots are taken in.
 */

/** How far the page is wider than the window, in CSS pixels (0 when nothing sticks out) */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** What sticks out past the window's edges, to say which element is to blame when the check fails */
async function culprits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    return [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && (box.right > width + 1 || box.left < -1)
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 4).join('.')}`)
  })
}

// The spacing WCAG 1.4.12 says readers must be able to set without anything breaking
const WIDER_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`

const WIDTHS = [
  { name: '320 px wide (400% zoom)', width: 320, height: 640 },
  { name: '200% zoom', width: 640, height: 400 },
]

test.describe('Reflow', () => {
  for (const language of ['ar', 'en'] as const) {
    for (const { name, path, signedIn } of [...PAGES, ...MORE_PAGES]) {
      test(`${name} (${language}) fits every width without scrolling sideways`, async ({ page }) => {
        // Layout doesn't depend on the device, so this runs once, in the desktop project
        test.skip(test.info().project.name !== 'desktop', 'layout is checked once')
        await useLibrary(page, { signedIn, language })
        for (const size of WIDTHS) {
          await page.setViewportSize({ width: size.width, height: size.height })
          await page.goto(path)
          await settled(page)
          expect(await overflow(page), `${size.name}: ${(await culprits(page)).join(', ')}`).toBeLessThanOrEqual(0)
        }
        // Wider spacing, at the narrowest width
        await page.setViewportSize({ width: 320, height: 640 })
        await page.goto(path)
        await settled(page)
        await page.addStyleTag({ content: WIDER_SPACING })
        expect(await overflow(page), `wider spacing: ${(await culprits(page)).join(', ')}`).toBeLessThanOrEqual(0)
      })
    }
  }
})
