import { expect, test } from '@playwright/test'
import ar from '../src/locales/ar.json' with { type: 'json' }
import { expectAccessible } from './accessibility'
import { layoutShift, watchLayoutShift } from './layoutShift'
import { PASSWORD, verificationLinkFor } from './mailpit'

/** An Arabic text with its {{placeholders}} filled in, as the app shows it */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name])
}

// Runs against the full stack (Docker Compose), including Mailpit. The other library journeys run in English; this
// one runs the main path in Arabic, the app's first language: right to left, Arabic digits, and the Arabic texts.
test.describe('The library in Arabic', () => {
  test('add a book, keep your place, save a benefit, find it, and choose dark', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-arabic-${Date.now()}@example.com`
    const library = page.getByRole('navigation', { name: ar.nav.main })

    // A confirmed, signed-in account, using the site in Arabic
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('language', 'ar'))
    expect(
      (
        await request.post('/api/v1/auth/register', { data: { email: address, password: PASSWORD, language: 'ar' } })
      ).status(),
    ).toBe(202)
    await page.goto(await verificationLinkFor(request, address))
    await expect(page.getByRole('heading', { name: ar.verify.successTitle })).toBeVisible()
    await page.goto('/sign-in')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.getByLabel(ar.signIn.email).fill(address)
    await page.getByLabel(ar.signIn.password, { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: ar.signIn.submit, exact: true }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${ar.nav.yourAccount}`) })).toBeVisible()

    // Add a book, with its author added from what was typed, and its science
    await library.getByRole('link', { name: ar.nav.books }).click()
    await page.getByRole('link', { name: ar.books.add }).click()
    await page.getByLabel(ar.books.form.titleAr).fill('صحيح البخاري')
    await page.getByRole('combobox', { name: ar.books.form.authors }).fill('البخاري')
    await page.getByRole('option', { name: fill(ar.picker.addAuthor, { name: 'البخاري' }) }).click()
    await expect(page.getByRole('list', { name: ar.books.form.authors })).toContainText('البخاري')
    await page.getByLabel(ar.books.fields.science, { exact: true }).selectOption({ label: 'الحديث' })
    await page.getByLabel(ar.books.fields.volumes).fill('9')
    await expectAccessible(page, 'the book form')
    await page.getByRole('button', { name: ar.common.save, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'صحيح البخاري', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText(ar.books.added)

    // Start reading, and keep your place: the page typed in Western digits is shown in Arabic ones
    await page.getByRole('button', { name: ar.books.startToday }).click()
    await expect(page.getByRole('button', { name: ar.books.finishToday })).toBeVisible()
    const bookmark = page.getByRole('region', { name: ar.books.bookmark.title })
    await bookmark.getByLabel(ar.books.bookmark.volume, { exact: true }).fill('2')
    await bookmark.getByLabel(ar.books.bookmark.page, { exact: true }).fill('50')
    await bookmark.getByRole('button', { name: ar.books.bookmark.put }).click()
    const place = fill(ar.books.bookmarkAtVolume, { volume: '٢', page: '٥٠' })
    await expect(bookmark.getByText(place)).toBeVisible()
    await expectAccessible(page, 'the book page')

    // Save a benefit from it
    await page
      .getByRole('region', { name: ar.benefits.fromThisBook })
      .getByRole('link', { name: ar.benefits.add })
      .click()
    await page.getByLabel(ar.benefits.form.text, { exact: true }).fill('إنّما الأعمالُ بالنيّات')
    await page.getByRole('button', { name: ar.common.save, exact: true }).click()
    await expect(page.getByRole('status')).toHaveText(ar.benefits.added)

    // Search finds the book without the article, and the benefit without its vowel marks
    await library.getByRole('link', { name: ar.nav.search }).click()
    await page.getByRole('searchbox', { name: ar.search.label }).fill('بخاري')
    await page.getByRole('button', { name: ar.search.button, exact: true }).click()
    const found = (group: string) => page.getByRole('region', { name: new RegExp(`^${group}`) })
    await expect(found(ar.nav.books).getByRole('link', { name: /صحيح البخاري/ })).toBeVisible()
    await page.getByRole('searchbox', { name: ar.search.label }).fill('الاعمال')
    await page.getByRole('button', { name: ar.search.button, exact: true }).click()
    await expect(found(ar.nav.benefits).getByRole('link')).toContainText('الأعمال')
    await expectAccessible(page, 'search')

    // The home page shows where you are, and doesn't move while it loads
    await watchLayoutShift(page)
    await page.goto('/')
    await expect(page.getByRole('region', { name: ar.home.where })).toContainText(place)
    await expect(page.getByRole('region', { name: ar.home.benefits })).toContainText('إنّما الأعمالُ بالنيّات')
    expect(await layoutShift(page)).toBeLessThan(0.1)
    await expectAccessible(page, 'home')

    // Choose dark on this device: it shows at once, and is there from the first moment after a reload
    await library.getByRole('link', { name: ar.nav.settings }).click()
    await page.locator('label').filter({ hasText: ar.settings.theme.dark }).click()
    await expect(page.getByRole('radio', { name: ar.settings.theme.dark })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('radio', { name: ar.settings.theme.dark })).toBeChecked()
    await expectAccessible(page, 'settings')
  })
})
