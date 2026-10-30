import { expect, test } from '@playwright/test'
import { expectAccessible } from './accessibility'
import { layoutShift, watchLayoutShift } from './layoutShift'

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
    await expect(page.getByRole('heading', { name: 'فهرس مكتبتك' })).toBeVisible()
    // Catches anything the Content-Security-Policy blocks, and any JavaScript crash
    expect(errors).toEqual([])
  })

  test('shows the timeline of scholars to anyone, from the public list, with nothing to add', async ({ page }) => {
    await page.goto('/')

    const section = page.getByRole('region', { name: 'أربعة عشر قرنًا من العلماء' })
    await section.scrollIntoViewIfNeeded()
    await expect(section.getByRole('heading', { name: /عالمًا على الخط الزمني|عالم على الخط الزمني/ })).toBeVisible()
    const ruler = section.getByRole('slider', { name: 'الخط الزمني للمؤلفين' })
    await expect(ruler).toHaveAttribute('aria-valuenow', '256') // al-Bukhari, whose Sahih is the example above
    await expect(section.getByRole('article').getByRole('heading', { name: /البخاري/ })).toBeVisible()
    await expect(section.getByRole('button', { name: 'أضفه إلى مكتبتي' })).toHaveCount(0)
    await ruler.focus()
    await page.keyboard.press('End')
    await expect(ruler).not.toHaveAttribute('aria-valuenow', '256')
    await expectAccessible(page, 'the landing page with its timeline')
  })

  test('nothing moves while the page and its fonts load', async ({ page }) => {
    await watchLayoutShift(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'فهرس مكتبتك' })).toBeVisible()
    expect(await layoutShift(page)).toBeLessThan(0.1) // Google counts up to 0.1 as good
  })

  test('switches to English, left-to-right, and remembers it after reload', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.getByRole('heading', { name: 'The index of your library' })).toBeVisible()

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'The index of your library' })).toBeVisible()
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

      await expectAccessible(page)
    })
  }
})
