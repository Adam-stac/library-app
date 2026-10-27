import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  expect(results.violations).toEqual([])
}

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Places and sciences', () => {
  test('signed-out visitors are sent to sign in', async ({ page }) => {
    await page.goto('/places')
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.goto('/sciences')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('add a place, give an author its place of death, and arrange the sciences', async ({
    page,
    request,
  }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-places-${Date.now()}@example.com`

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

    // The shared list everyone starts with, and none of your own yet
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Places' }).click()
    await expect(page.getByRole('heading', { name: 'Places', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Makkah/ })).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('link', { name: 'Added by you' }).click()
    await expect(page.getByText("You haven't added any places yet.", { exact: false })).toBeVisible()

    // Add a place
    await page.getByRole('link', { name: 'Add a place' }).click()
    await expect(page.getByRole('heading', { name: 'Add a place', level: 1 })).toBeVisible()
    await page.getByLabel('Name in Arabic').fill('خرتنك')
    await page.getByLabel('Name in English').fill('Khartank')
    await page.getByLabel('Latitude').fill('39.7')
    await page.getByLabel('Longitude').fill('66.98')
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Khartank', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Place added.')
    await expect(page.getByRole('link', { name: /39.70000° N, 66.98000° E/ })).toBeVisible()

    // Edit it
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByLabel('Country in English').fill('Uzbekistan')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes saved.')
    await expect(page.getByText('Uzbekistan')).toBeVisible()

    // An author who died there: the place is found as you type
    await page.goto('/authors/new')
    await page.getByLabel('Name in English').fill('al-Bukhari')
    await page.getByRole('combobox', { name: 'Place of death' }).fill('Khart')
    await page.getByRole('option', { name: /^Khartank/ }).click()
    await expect(page.getByRole('button', { name: 'Remove Khartank' })).toBeVisible()
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'al-Bukhari', level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Khartank' }).click()

    // A place an author still names can't be deleted, and the page says why
    await expect(page.getByRole('heading', { name: 'Khartank', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('alert')).toContainText('This is still used by 1 author')

    // Sciences: the starter list, then one of your own, renamed and deleted
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Sciences' }).click()
    await expect(page.getByRole('heading', { name: 'Sciences', level: 1 })).toBeVisible()
    await expect(page.getByText('13 sciences')).toBeVisible()
    await expectAccessible(page)
    const add = page.getByRole('form', { name: 'Add a science' })
    await add.getByLabel('Name in Arabic').fill('الفقه الحنبلي')
    await add.getByLabel('Name in English').fill('Hanbali fiqh')
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('status')).toHaveText('Hanbali fiqh was added.')
    await expect(page.getByText('14 sciences')).toBeVisible()
    await page.getByRole('button', { name: 'Rename Hanbali fiqh' }).click()
    const rename = page.getByRole('form', { name: 'Rename Hanbali fiqh' })
    await rename.getByLabel('Name in English').fill('Fiqh (Hanbali)')
    await rename.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes saved.')
    await page.getByRole('button', { name: 'Delete Fiqh (Hanbali)' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('status')).toHaveText('Fiqh (Hanbali) was deleted.')
    await expect(page.getByText('13 sciences')).toBeVisible()
  })
})
