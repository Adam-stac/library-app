import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { PASSWORD, verificationLinkFor } from './mailpit'
import { expectAccessible } from './accessibility'

// Runs against the full stack (Docker Compose), including Mailpit, with the made-up sample ISBN ranges loaded
// (pnpm --filter @library-app/web e2e:ranges; CI does this before the browser tests). In the sample, 978-9933-685 is
// one Syrian publisher's code.

async function signedInAccount(page: Page, request: APIRequestContext) {
  const address = `e2e-suggest-${Date.now()}@example.com`
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

const CHECK = 'May be incorrect, please check.'

test.describe('Filling in a book from its ISBN', () => {
  test('your other books by the same publisher fill in its name and place; the country gives the language', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow()
    await signedInAccount(page, request)

    // A book from a Syrian publisher, typed in by hand
    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('الأم')
    await page.getByLabel('ISBN').fill('9789933685010')
    await page.getByLabel('Publisher').fill('دار الغوثاني')
    await page.getByLabel('Place of publication').fill('دمشق')
    // The country fills in the language here too; the reader clears it, so this book has none. Without waiting for
    // that, Save could win or lose the race with the suggestion, and the next book's language came from either
    await expect(page.getByLabel('Language')).toHaveValue('ar')
    await page.getByLabel('Language').selectOption('')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')

    // Another of theirs: the publisher and place are filled in, each with its note
    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('الرسالة')
    await page.getByLabel('ISBN').fill('978-9933-685-02-7')
    await expect(page.getByLabel('Publisher')).toHaveValue('دار الغوثاني')
    await expect(page.getByLabel('Place of publication')).toHaveValue('دمشق')
    await expect(page.getByLabel('Publisher')).toHaveAccessibleDescription(
      `${CHECK} From your books by the same publisher.`,
    )
    // You had no language on the first book, so it comes from the ISBN's country
    await expect(page.getByLabel('Language')).toHaveValue('ar')
    await expect(page.getByLabel('Language')).toHaveAccessibleDescription(`${CHECK} From the ISBN's country: Syria.`)
    await expectAccessible(page, 'filled-in fields')

    // Editing a filled value makes it yours: its note goes, and it is saved as typed
    await page.getByLabel('Place of publication').fill('دمشق، سوريا')
    await expect(page.getByLabel('Place of publication')).not.toHaveAccessibleDescription(/please check/)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')
    await expect(page.getByText('دار الغوثاني')).toBeVisible()
    await expect(page.getByText('دمشق، سوريا')).toBeVisible()
  })
})
