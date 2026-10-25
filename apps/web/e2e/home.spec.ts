import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.describe('Home page', () => {
  test('opens in Arabic, right-to-left, with no browser errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'مرحبًا بك' })).toBeVisible()
    // Catches anything the Content-Security-Policy blocks, and any JavaScript crash
    expect(errors).toEqual([])
  })

  test('switches to English, left-to-right, and remembers it after reload', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
  })

  test('the layout mirrors between Arabic and English', async ({ page }) => {
    await page.goto('/')
    const name = page.getByRole('link', { name: 'خِزانة', exact: true })
    const toggle = page.getByRole('button', { name: 'English' })
    // Arabic: the app name is on the right, the language button on the left
    expect((await name.boundingBox())!.x).toBeGreaterThan((await toggle.boundingBox())!.x)

    await toggle.click()
    const englishName = page.getByRole('link', { name: 'Khizāna', exact: true })
    const englishToggle = page.getByRole('button', { name: 'العربية' })
    // English: the app name is on the left, the language button on the right
    expect((await englishName.boundingBox())!.x).toBeLessThan((await englishToggle.boundingBox())!.x)
  })

  for (const language of ['ar', 'en'] as const) {
    test(`meets WCAG 2.2 AA accessibility checks (${language})`, async ({ page }) => {
      await page.addInitScript((lng) => localStorage.setItem('language', lng), language)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('lang', language)

      const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()

      expect(results.violations).toEqual([])
    })
  }
})
