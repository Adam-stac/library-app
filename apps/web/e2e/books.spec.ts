import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  expect(results.violations).toEqual([])
}

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Books', () => {
  test('signed-out visitors are sent to sign in', async ({ page }) => {
    await page.goto('/books')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('add a book with its work and author, read it, move the bookmark, edit and delete it', async ({
    page,
    request,
  }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-books-${Date.now()}@example.com`

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

    // An empty shelf
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Books' }).click()
    await expect(page.getByRole('heading', { name: 'Books', level: 1 })).toBeVisible()
    await expect(page.getByText("You haven't added any books yet.")).toBeVisible()

    // Add a book: the work, its author (added from what was typed) and its science, in one form
    await page.getByRole('link', { name: 'Add a book' }).click()
    await page.getByLabel('Title in Arabic').fill('صحيح البخاري')
    await page.getByLabel('Title in English').fill('Sahih al-Bukhari')
    await page.getByRole('combobox', { name: 'Authors' }).fill('البخاري')
    await page.getByRole('option', { name: 'Add “البخاري” as a new author' }).click()
    await expect(page.getByRole('list', { name: 'Authors' })).toContainText('البخاري')
    await page.getByLabel('Science').selectOption({ label: 'Ḥadīth' })
    await page.getByLabel('Volumes').fill('9')
    await page.getByLabel('Publisher').fill('دار طوق النجاة')
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Sahih al-Bukhari', level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Book added.')
    await expect(page.getByText('دار طوق النجاة')).toBeVisible()
    await expectAccessible(page)

    // Start reading, and keep your place
    await page.getByRole('button', { name: 'Start reading today' }).click()
    await expect(page.getByRole('button', { name: 'Finished today' })).toBeVisible()
    const bookmark = page.getByRole('region', { name: 'Bookmark' })
    await bookmark.getByLabel('Volume').fill('2')
    await bookmark.getByLabel('Page').fill('٥٠')
    await bookmark.getByRole('button', { name: 'Put the bookmark here' }).click()
    await expect(bookmark.getByText('Volume 2, page 50')).toBeVisible()

    // The home page shows the library at a glance, and where you are
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Home' }).click()
    await expect(page.getByText(/Your library holds 1 book and 1 author\./)).toContainText('You are reading 1 of them.')
    const where = page.getByRole('region', { name: 'Where you are' })
    await expect(where).toContainText('Volume 2, page 50')
    await expect(page.getByRole('region', { name: 'Your library by science' })).toContainText('Ḥadīth')
    await expectAccessible(page)
    await where.getByRole('link').click()

    // Edit the copy
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByLabel('Shelf').fill('Study, case 2')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes saved.')
    await expect(page.getByText('Study, case 2')).toBeVisible()

    // It is on the shelf, marked as being read, and on its author's page
    await page.getByRole('link', { name: 'All books' }).click()
    await expect(page.getByText('1 book')).toBeVisible()
    await expect(page.getByRole('link', { name: /Sahih al-Bukhari/ })).toContainText('Reading')
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Authors' }).click()
    await page.getByRole('link', { name: /البخاري/ }).click()
    await expect(page.getByRole('heading', { name: 'Books by this author' })).toBeVisible()
    await page.getByRole('link', { name: /Sahih al-Bukhari/ }).click()
    await expect(page.getByText(/Copies of/)).toBeVisible()

    // Delete it
    await page.getByRole('link', { name: /Sahih al-Bukhari/ }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('status')).toHaveText('Sahih al-Bukhari was deleted.')
    await expect(page.getByText("You haven't added any books yet.")).toBeVisible()
  })
})
