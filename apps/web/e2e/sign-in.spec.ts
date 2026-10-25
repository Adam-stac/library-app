import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Sign in and sign out', () => {
  test('sign in with a confirmed account, stay signed in, then sign out', async ({ page, context, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const address = `e2e-sign-in-${Date.now()}@example.com`
    await page.addInitScript(() => localStorage.setItem('language', 'en'))

    // A confirmed account
    const registered = await request.post('/api/v1/auth/register', {
      data: { email: address, password: PASSWORD, language: 'en' },
    })
    expect(registered.status()).toBe(202)
    await page.goto(await verificationLinkFor(request, address))
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible()
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click()

    // A wrong password gets the same message whatever was wrong
    await page.getByLabel('Email').fill(address)
    await page.getByLabel('Password', { exact: true }).fill('not the right password at all')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.')

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Your account/ })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)

    // The session cookie can't be read by scripts, is HTTPS-only, and isn't sent by other sites' forms
    const cookies = await context.cookies()
    const session = cookies.find((cookie) => cookie.name === '__Host-SESSION')
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-SESSION')

    // Still signed in after a reload (the session is on the server)
    await page.reload()
    await expect(page.getByRole('button', { name: /^Your account/ })).toBeVisible()

    await page.getByRole('button', { name: /^Your account/ }).click() // the account menu
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(204)
  })

  test('signing in without the CSRF token is refused', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'API check, once is enough')
    const response = await request.post('/api/v1/auth/login', {
      data: { email: 'reader@example.com', password: PASSWORD },
    })

    expect(response.status()).toBe(403)
  })

  for (const language of ['ar', 'en'] as const) {
    test(`the sign-in page meets WCAG 2.2 AA (${language})`, async ({ page }) => {
      await page.addInitScript((lng) => localStorage.setItem('language', lng), language)
      await page.goto('/sign-in')
      await expect(page.locator('h1')).toBeVisible()

      const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
      expect(results.violations).toEqual([])
    })
  }
})
