import AxeBuilder from '@axe-core/playwright'
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { emailedLink, PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

// Runs against the full stack (Docker Compose), including Mailpit.
const NEW_PASSWORD = 'a brand new passphrase for 2026'
const NEWER_PASSWORD = 'and another one for next year'

async function confirmedAccount(page: Page, request: APIRequestContext, address: string) {
  const registered = await request.post('/api/v1/auth/register', {
    data: { email: address, password: PASSWORD, language: 'en' },
  })
  expect(registered.status()).toBe(202)
  await page.goto(await verificationLinkFor(request, address))
  await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
}

async function signIn(page: Page, address: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Passwords', () => {
  test('forgot password: reset by email link, then change it while signed in', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-password-${Date.now()}@example.com`
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await confirmedAccount(page, request, address)

    // Forgot password
    await page.goto('/sign-in')
    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await page.getByLabel('Email').fill(address)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

    const link = await emailedLink(request, address, 'reset-password')
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await expect(page).not.toHaveURL(/token=/) // the one-time token leaves the address bar once the page starts
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page.getByRole('heading', { name: 'Your password has been changed' })).toBeVisible()

    // The link works only once
    await page.goto('about:blank')
    await page.goto(link)
    await page.getByLabel('New password').fill(NEWER_PASSWORD)
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page.getByRole('heading', { name: 'This link is invalid or has expired' })).toBeVisible()

    // The old password no longer works; the new one does
    await signIn(page, address, PASSWORD)
    await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.')
    await signIn(page, address, NEW_PASSWORD)
    await expect(page.getByText("You're signed in as")).toBeVisible()

    // Change password while signed in
    await page.getByRole('link', { name: 'Change password' }).click()
    await page.getByLabel('Current password').fill(NEW_PASSWORD)
    await page.getByLabel('New password').fill(NEWER_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByRole('heading', { name: 'Your password has been changed' })).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200) // still signed in here
  })

  for (const language of ['ar', 'en'] as const) {
    test(`the password pages meet WCAG 2.2 AA (${language})`, async ({ page }) => {
      await page.addInitScript((lng) => localStorage.setItem('language', lng), language)

      for (const path of ['/forgot-password', '/reset-password#token=x']) {
        await page.goto(path)
        await expect(page.locator('h1')).toBeVisible()
        const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
        expect(results.violations, path).toEqual([])
      }
    })
  }
})
