import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, verificationLinkFor } from './mailpit'
import { expectAccessible } from './accessibility'
import { barcodeVideo } from './barcode'

// A fake camera that shows the barcode of 978-0-306-40615-7 (the ISBN-10 of the same book is 0-306-40615-2).
// The browser's flags are set for the whole file; only this file's tests are given the camera.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${barcodeVideo('9780306406157', 'isbn-9780306406157')}`,
    ],
  },
})

async function signedInAccount(page: Page, request: Parameters<typeof verificationLinkFor>[0], prefix: string) {
  const address = `${prefix}-${Date.now()}@example.com`
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

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Scan a barcode or type an ISBN', () => {
  test('a typed or scanned ISBN says when you already have the book, in either ISBN form', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow()
    await signedInAccount(page, request, 'e2e-isbn')

    // The first copy, with its ISBN typed in Arabic digits: nothing to warn about yet
    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('الأم')
    await page.getByLabel('ISBN').fill('٩٧٨٠٣٠٦٤٠٦١٥٧')
    await expect(page.getByText('You already have this book:')).toBeHidden()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')

    // A second form: the ISBN-10 of the same book, hyphens and all, finds the first
    await page.goto('/books/new')
    await page.getByLabel('ISBN').fill('0-306-40615-2')
    const notice = page.getByText('You already have this book:').locator('..')
    await expect(notice.getByRole('link', { name: 'الأم' })).toBeVisible()
    await expectAccessible(page)

    // A different number, and a number that isn't an ISBN, say nothing
    await page.getByLabel('ISBN').fill('9791090636071')
    await expect(page.getByText('You already have this book:')).toBeHidden()
    await page.getByLabel('ISBN').fill('978030640615')
    await expect(page.getByText('You already have this book:')).toBeHidden()

    // The book's own edit page doesn't count the book as a copy of itself
    await page.goto('/books')
    await page.getByRole('link', { name: 'الأم' }).click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByLabel('ISBN')).toHaveValue('9780306406157')
    await expect(page.getByText('You already have this book:')).toBeHidden()
  })

  test('scanning the barcode fills in the ISBN and shows the book you already have', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow()
    await signedInAccount(page, request, 'e2e-scan')

    // A book to find again
    await page.goto('/books/new')
    await page.getByLabel('Title in Arabic').fill('الرسالة')
    await page.getByLabel('ISBN').fill('9780306406157')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Book added.')

    // Scan it: the camera opens only now, the ISBN is filled in and the dialog closes
    await page.goto('/books/new')
    await page.getByRole('button', { name: 'Scan barcode' }).click()
    await expect(page.getByRole('dialog', { name: 'Scan the barcode' })).toBeVisible()
    await expectAccessible(page)
    await expect(page.getByLabel('ISBN')).toHaveValue('9780306406157', { timeout: 20_000 })
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('link', { name: 'الرسالة' })).toBeVisible()
  })
})
