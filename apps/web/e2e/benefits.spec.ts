import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  expect(results.violations).toEqual([])
}

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Benefits and search', () => {
  test('signed-out visitors are sent to sign in', async ({ page }) => {
    await page.goto('/benefits')
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.goto('/search?q=x')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('save a benefit from a book, find it by searching, edit and delete it', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-benefits-${Date.now()}@example.com`

    // A confirmed, signed-in account, using the site in English
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('language', 'en'))
    expect(
      (
        await request.post('/api/v1/auth/register', { data: { email: address, password: PASSWORD, language: 'en' } })
      ).status(),
    ).toBe(202)
    await page.goto(await verificationLinkFor(request, address))
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(address)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Your account/ })).toBeVisible()

    // A book to take the benefit from
    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('الأربعون النووية')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')

    // Save a benefit from it, with the page it is on
    const fromBook = page.getByRole('region', { name: 'Benefits from this book' })
    await expect(fromBook.getByText('No benefits from this book yet.')).toBeVisible()
    await fromBook.getByRole('link', { name: 'Add a benefit' }).click()
    await expect(page.getByRole('button', { name: 'Remove الأربعون النووية' })).toBeVisible()
    await page.getByLabel('The benefit').fill('إنّما الأعمالُ بالنيّات')
    await page.getByLabel('Page').fill('7')
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Benefit saved.')
    await expect(fromBook.getByText('إنّما الأعمالُ بالنيّات')).toBeVisible()
    await expect(fromBook.getByText('Page 7')).toBeVisible()

    // Search finds it without the vowel marks and the hamza
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Search' }).click()
    await page.getByRole('searchbox', { name: 'Search your library' }).fill('الاعمال')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('1 match for “الاعمال”')
    await expectAccessible(page)
    await page
      .getByRole('region', { name: /Benefits/ })
      .getByRole('link')
      .click()

    // Edit it
    await page.getByRole('link', { name: /^Edit/ }).click()
    await page.getByLabel('Page').fill('8')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes saved.')
    await expect(page.getByText('Page 8')).toBeVisible()

    // It is on the benefits page, and can be deleted there
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Benefits' }).click()
    await expect(page.getByText('1 benefit')).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('button', { name: /^Delete/ }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('status')).toHaveText('Benefit deleted.')
    await expect(page.getByText("You haven't saved any benefits yet.")).toBeVisible()
  })
})
