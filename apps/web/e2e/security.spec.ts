import { expect, test } from '@playwright/test'

// These run against nginx (Docker Compose), which is what serves the app in production.
test.describe('Security from the outside', () => {
  test('pages are served with security headers and no version leak', async ({ request }) => {
    const response = await request.get('/')
    const headers = response.headers()

    expect(response.status()).toBe(200)
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['server'] ?? '').not.toMatch(/\d/) // e.g. "nginx", never "nginx/1.29.1"
  })

  test('the API is reached through /api and is closed by default', async ({ request }) => {
    const response = await request.get('/api/v1/authors')

    expect(response.status()).toBe(403)
  })
})
