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
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp')
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(headers['server'] ?? '').not.toMatch(/\d/) // e.g. "nginx", never "nginx/1.29.1"
  })

  test('only our own pages may use the camera, and nothing else new is opened up', async ({ request }) => {
    const headers = (await request.get('/')).headers()
    const policy = headers['permissions-policy']

    // The camera is for scanning a book's barcode on our own page (ADR 0010); no other site's frame may ask for it
    expect(policy).toContain('camera=(self)')
    expect(policy).toContain('microphone=()')
    expect(policy).toContain('geolocation=()')
    expect(policy).toContain('payment=()')
    expect(policy).not.toContain('*')
    // The picture is read on the device: the page may talk only to our own server
    expect(headers['content-security-policy']).toContain("connect-src 'self'")
  })

  test('the API is reached through /api and is closed by default', async ({ request }) => {
    const response = await request.get('/api/v1/authors')

    expect(response.status()).toBe(401)
  })
})
