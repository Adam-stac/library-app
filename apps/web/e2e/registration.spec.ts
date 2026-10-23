import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { PASSWORD, verificationLinkFor, WCAG_AA } from './mailpit'

// Runs against the full stack (Docker Compose), including Mailpit.

test.describe('Registration', () => {
  for (const language of ['ar', 'en'] as const) {
    test(`register, confirm by email, and the link works only once (${language})`, async ({ page, request }, testInfo) => {
      // The full journey runs once per language on desktop; it sends real requests and emails
      test.skip(testInfo.project.name !== 'desktop', 'journey covered on desktop')
      const address = `e2e-${language}-${Date.now()}@example.com`
      const ui =
        language === 'ar'
          ? { email: 'البريد الإلكتروني', password: 'كلمة المرور', submit: 'إنشاء الحساب', inbox: 'تفقّد بريدك', done: 'تم تأكيد بريدك', invalid: 'الرابط غير صالح أو منتهي الصلاحية' }
          : { email: 'Email', password: 'Password', submit: 'Create account', inbox: 'Check your inbox', done: 'Your email is confirmed', invalid: 'This link is invalid or has expired' }

      await page.addInitScript((lng) => localStorage.setItem('language', lng), language)
      await page.goto('/register')
      await page.getByLabel(ui.email).fill(address)
      await page.getByLabel(ui.password, { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: ui.submit }).click()
      await expect(page.getByRole('heading', { name: ui.inbox })).toBeVisible()

      const link = await verificationLinkFor(request, address)
      await page.goto(link)
      await expect(page.getByRole('heading', { name: ui.done })).toBeVisible()
      // The one-time token must not stay in the address bar or history
      expect(page.url()).not.toContain('token=')

      // Open the link again as a fresh page load, as when it's clicked a second time from the email
      await page.goto('about:blank')
      await page.goto(link)
      await expect(page.getByRole('heading', { name: ui.invalid })).toBeVisible()
    })
  }

  test('a short password is caught in the browser, with the message next to the field', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('البريد الإلكتروني').fill('reader@example.com')
    await page.getByLabel('كلمة المرور', { exact: true }).fill('short')
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click()

    const password = page.getByLabel('كلمة المرور', { exact: true })
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    await expect(password).toBeFocused()
    await expect(page.getByText('يجب أن تتكوّن كلمة المرور من ١٥ حرفًا على الأقل.')).toBeVisible()
  })

  for (const language of ['ar', 'en'] as const) {
    test(`registration and verification pages meet WCAG 2.2 AA (${language})`, async ({ page }) => {
      await page.addInitScript((lng) => localStorage.setItem('language', lng), language)

      for (const path of ['/register', '/verify-email']) {
        await page.goto(path)
        await expect(page.locator('h1')).toBeVisible()
        const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
        expect(results.violations, path).toEqual([])
      }
    })
  }
})
