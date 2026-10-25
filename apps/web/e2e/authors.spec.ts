import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  expect(results.violations).toEqual([])
}

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Authors', () => {
  test('signed-out visitors are sent to sign in', async ({ page }) => {
    await page.goto('/authors')

    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('add, view, edit and delete an author, in English and Arabic', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-authors-${Date.now()}@example.com`

    // A confirmed, signed-in account, using the site in English to start with
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('language', 'en'))
    expect(
      (await request.post('/api/v1/auth/register', { data: { email: address, password: PASSWORD, language: 'en' } }))
        .status(),
    ).toBe(202)
    await page.goto(await verificationLinkFor(request, address))
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(address)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByText("You're signed in as")).toBeVisible()

    // An empty list
    await page.getByRole('link', { name: 'Authors', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Authors', level: 1 })).toBeVisible()
    await expect(page.getByText("You haven't added any authors yet.")).toBeVisible()
    await expectAccessible(page)

    // Add an author: the CE years are worked out from the Hijri year as you type
    await page.getByRole('link', { name: 'Add an author' }).click()
    await expect(page.getByRole('heading', { name: 'Add an author', level: 1 })).toBeVisible()
    await page.getByLabel('Name in Arabic').fill('البخاري')
    await page.getByLabel('Name in English').fill('al-Bukhari')
    await page.getByLabel('Hijri year of birth').fill('194')
    await page.getByLabel('The year of birth is approximate').check()
    await page.getByLabel('Hijri year of death').fill('٢٥٦') // Arabic-Indic digits are accepted
    await expect(page.getByText('Shown as: 256 AH (869–870 CE)')).toBeVisible()
    await page.getByLabel('Biography').fill('صاحب الصحيح.\nوُلد في بخارى.')
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: 'al-Bukhari', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Author added.')
    await expect(page.getByText('c. 194 AH (809–810 CE)')).toBeVisible()
    await expect(page.getByText('256 AH (869–870 CE)', { exact: true })).toBeVisible()
    await expectAccessible(page)

    // Edit it
    await page.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Edit al-Bukhari' })).toBeVisible()
    await page.getByLabel('Name in English').fill('Imam al-Bukhari')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Imam al-Bukhari', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Changes saved.')

    // In Arabic: right to left, the Arabic name first, Arabic-Indic digits
    await page.getByRole('button', { name: 'العربية' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'البخاري', level: 1 })).toBeVisible()
    await expect(page.getByText('٢٥٦هـ (٨٦٩–٨٧٠م)', { exact: true })).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('link', { name: 'كل المؤلفين' }).click()
    await expect(page.getByRole('heading', { name: 'المؤلفون', level: 1 })).toBeVisible()
    await expect(page.getByText('مؤلف واحد')).toBeVisible()
    await expectAccessible(page)

    // Delete it
    await page.getByRole('link', { name: /البخاري/ }).click()
    await page.getByRole('button', { name: 'حذف', exact: true }).click()
    await page.getByRole('button', { name: 'نعم، احذف' }).click()
    await expect(page.getByRole('heading', { name: 'المؤلفون', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('حُذف البخاري.')
    await expect(page.getByText('لم تُضف أي مؤلف بعد.')).toBeVisible()
  })
})
