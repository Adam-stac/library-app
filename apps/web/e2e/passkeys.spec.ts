import { expect, type Page, test } from '@playwright/test'
import { emailText, PASSWORD, verificationLinkFor } from './mailpit'

// Runs against the full stack (Docker Compose), including Mailpit.
// Chrome's virtual authenticator stands in for a fingerprint reader: it creates and uses real passkeys.
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible()
}

test.describe('Passkeys', () => {
  test('add a passkey, then sign in with it, with no password', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-passkey-${Date.now()}@example.com`
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await addVirtualAuthenticator(page)

    // A confirmed, signed-in account
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

    // Add a passkey
    await page.getByRole('link', { name: 'Passkeys' }).click()
    await expect(page.getByText("You haven't added a passkey yet.")).toBeVisible()
    await page.getByRole('button', { name: 'Add a passkey' }).click()
    await page.getByLabel('Name').fill('Test laptop')
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('status')).toContainText('“Test laptop” was added.')
    await expect(page.getByText('not used yet')).toBeVisible()

    // The owner is told
    expect(await emailText(request, address, 'A passkey was added')).toContain('Test laptop')

    // Sign in with the passkey alone
    await signOut(page)
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    await expect(page.getByText("You're signed in as")).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200)
  })
})
