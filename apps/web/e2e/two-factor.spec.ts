import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'
import { totp } from './totp'

// Runs against the full stack (Docker Compose), including Mailpit.
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  expect(results.violations, what).toEqual([])
}

/** Signs out and waits until the server has ended the session, so the next step can't race it. */
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible()
}

async function enterPassword(page: Page, address: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test.describe('Two-step verification', () => {
  test('turn it on, sign in with the app, then with a recovery code', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-2fa-${Date.now()}@example.com`
    await page.addInitScript(() => localStorage.setItem('language', 'en'))

    // A confirmed, signed-in account
    expect(
      (await request.post('/api/v1/auth/register', { data: { email: address, password: PASSWORD, language: 'en' } }))
        .status(),
    ).toBe(202)
    await page.goto(await verificationLinkFor(request, address))
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
    await enterPassword(page, address)
    await expect(page.getByText("You're signed in as")).toBeVisible()

    // Turn it on
    await page.getByRole('link', { name: 'Two-step verification' }).click()
    await expectAccessible(page, 'status page')
    await page.getByRole('button', { name: 'Turn on' }).click()
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
    await expectAccessible(page, 'setup page')
    const secret = (await page.getByTestId('totp-secret').textContent()) ?? ''
    await page.getByLabel('6-digit code').fill(totp(secret))
    await page.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByRole('heading', { name: 'Your recovery codes' })).toBeVisible()
    const recoveryCodes = await page.getByRole('list', { name: 'Your recovery codes' }).getByRole('listitem').allTextContents()
    expect(recoveryCodes).toHaveLength(10)
    await page.getByRole('button', { name: "I've saved them" }).click()
    await expect(page.getByText('You have 10 recovery codes left.')).toBeVisible()

    // Signing in now needs a code from the app (the next one: each code works once)
    await signOut(page)
    await enterPassword(page, address)
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(204) // not signed in yet
    await expectAccessible(page, 'second step')
    await page.getByLabel('Code').fill(totp(secret, 1))
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText("You're signed in as")).toBeVisible()

    // Or with a recovery code, which then works only once
    await signOut(page)
    await enterPassword(page, address)
    await page.getByLabel('Code').fill(recoveryCodes[0])
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText("You're signed in as")).toBeVisible()

    await signOut(page)
    await enterPassword(page, address)
    await page.getByLabel('Code').fill(recoveryCodes[0])
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByRole('alert')).toContainText("That code didn't work.")
  })
})
