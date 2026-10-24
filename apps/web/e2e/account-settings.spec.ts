import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { emailedLink, emailText, PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

// Runs against the full stack (Docker Compose), including Mailpit.
test.describe('Account settings', () => {
  test('change the email address through the new inbox, then delete the account', async ({ page, request }, testInfo) => {
    // The journey sends real requests and emails, so it runs once, on desktop
    test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
    test.slow() // real emails and password hashing: allow three times the usual 30 seconds
    const stamp = Date.now()
    const address = `e2e-account-${stamp}@example.com`
    const newAddress = `e2e-account-new-${stamp}@example.com`
    await page.addInitScript(() => localStorage.setItem('language', 'en'))

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

    // Ask to change the email address
    await page.getByRole('link', { name: 'Account settings' }).click()
    await expect(page.getByRole('heading', { name: 'Account settings', level: 1 })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
    expect(results.violations).toEqual([])
    await page.getByLabel('New email address').fill(newAddress)
    await page.getByLabel('Current password').first().fill(PASSWORD)
    await page.getByRole('button', { name: 'Send the link' }).click()
    await expect(page.getByRole('status')).toContainText(`Check the inbox of ${newAddress}`)

    // The current address is warned; the new one gets the link
    expect(await emailText(request, address, 'email was requested')).toContain('e•••@example.com')
    await page.goto(await emailedLink(request, newAddress, 'confirm-email-change'))
    await expect(page.getByRole('heading', { name: 'Your email address has been changed' })).toBeVisible()
    await expect(page).not.toHaveURL(/token=/)
    await expect(page.getByRole('navigation')).toContainText(newAddress)
    expect(await emailText(request, address, 'was changed')).toContain('e•••@example.com')

    // Delete the account
    await page.goto('/account')
    await page.getByLabel('Current password').last().fill(PASSWORD)
    await page.getByRole('checkbox', { name: "I understand this can't be undone" }).check()
    await page.getByRole('button', { name: 'Delete my account' }).click()
    await expect(page.getByRole('heading', { name: 'Your account was deleted' })).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible()
    expect(await emailText(request, newAddress, 'was deleted')).toContain('deleted')
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(204)
  })
})
