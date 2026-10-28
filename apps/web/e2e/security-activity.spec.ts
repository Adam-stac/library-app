import { expect, type Page, test } from '@playwright/test'
import { emailText, PASSWORD, verificationLinkFor } from './mailpit'
import { expectAccessible } from './accessibility'

// Runs against the full stack (Docker Compose), including Mailpit.
// Two browser contexts are two devices: each has its own cookies, and its own User-Agent so the app can tell them apart.
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'

async function signIn(page: Page, address: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Your account/ })).toBeVisible()
}

test.describe('Security activity', () => {
  test('see where you are signed in, get told about a new device, and sign it out', async ({
    browser,
    request,
  }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-security-${Date.now()}@example.com`
    const laptopContext = await browser.newContext({ userAgent: WINDOWS_CHROME })
    const otherContext = await browser.newContext({ userAgent: LINUX_FIREFOX })
    await laptopContext.addInitScript(() => localStorage.setItem('language', 'en'))
    await otherContext.addInitScript(() => localStorage.setItem('language', 'en'))
    const laptop = await laptopContext.newPage()
    const other = await otherContext.newPage()

    // A confirmed account, signed in on the laptop
    expect(
      (await request.post('/api/v1/auth/register', { data: { email: address, password: PASSWORD, language: 'en' } }))
        .status(),
    ).toBe(202)
    await laptop.goto(await verificationLinkFor(request, address))
    await expect(laptop.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
    await signIn(laptop, address)

    // Signing in on another device emails the owner
    await signIn(other, address)
    const email = await emailText(request, address, 'New sign-in')
    expect(email).toContain('Firefox on Linux')
    expect(email).toContain('/security')

    // The laptop sees both, itself first
    await laptop.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: 'Settings' }).click()
    await laptop.getByRole('link', { name: 'Security' }).click()
    await expect(laptop.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible()
    const where = laptop.getByRole('list', { name: "Where you're signed in" })
    await expect(where.getByRole('listitem')).toHaveCount(2)
    await expect(where.getByRole('listitem').first()).toContainText('Chrome on Windows')
    await expect(where.getByRole('listitem').first()).toContainText('This device')
    await expect(laptop.getByText('Signed in with your password').first()).toBeVisible()
    await expectAccessible(laptop)

    // ...and signs the other device out
    await laptop.getByRole('button', { name: 'Sign out Firefox on Linux' }).click()
    await expect(laptop.getByRole('status')).toContainText('Firefox on Linux was signed out.')
    await expect(laptop.getByText("You're only signed in here.")).toBeVisible()
    await expect(laptop.getByText('Firefox on Linux was signed out from this page')).toBeVisible()

    // The other device is signed out at once; the laptop is not
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(204)
    expect((await laptop.request.get('/api/v1/auth/me')).status()).toBe(200)

    await laptopContext.close()
    await otherContext.close()
  })
})
