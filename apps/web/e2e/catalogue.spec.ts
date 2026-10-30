import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { PASSWORD, verificationLinkFor } from './mailpit'
import { expectAccessible } from './accessibility'

// Runs against the full stack (Docker Compose), with the scholars snapshot from Wikidata that ships with the API.

async function signedInAccount(page: Page, request: APIRequestContext) {
  const address = `e2e-catalogue-${Date.now()}@example.com`
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
}

test.describe("Adding a classical work from the scholars' catalogue", () => {
  test('a title typed with a typo finds the work; choosing it fills the titles and adds its author', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow()
    await signedInAccount(page, request)

    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('صحيج البخاري') // a typo: ج for ح
    const offers = page.getByRole('region', { name: "From the scholars' catalogue" })
    await expect(offers.getByRole('button').first()).toBeVisible()
    await expectAccessible(page, 'catalogue offers')
    await offers.getByRole('button', { name: /^صحيح البخاري/ }).click()

    await expect(page.getByLabel('Title in Arabic')).toHaveValue('صحيح البخاري')
    await expect(page.getByLabel('Title in English')).toHaveValue('Sahih al-Bukhari')
    await expect(page.getByLabel('Title in Arabic')).toHaveAccessibleDescription(
      "May be incorrect, please check. From the scholars' catalogue (Wikidata).",
    )

    // A new account has no authors of its own, so the scholar is added as a new one, with their death year
    await page.getByRole('button', { name: /^Add .* as a new author$/ }).click()
    await expect(page.getByRole('list', { name: 'Authors' }).getByRole('listitem')).toHaveCount(1)
    await expectAccessible(page, 'author added from the catalogue')

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')
    await expect(page.getByRole('heading', { name: 'Sahih al-Bukhari', level: 1 })).toBeVisible()

    // The author was added with the year Wikidata gives (870 CE)
    await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Authors' }).click()
    await expect(page.getByText(/870/)).toBeVisible()
  })

  test('the About the data page credits the sources', async ({ page }) => {
    await page.goto('/about/data')
    await expect(page.getByRole('heading', { name: 'About the data', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Wikidata' })).toHaveAttribute('href', 'https://www.wikidata.org/')
    await expectAccessible(page, 'about the data')
  })
})
