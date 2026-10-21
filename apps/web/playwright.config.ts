import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the full stack (nginx + API + Postgres), started with Docker Compose.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // a stray test.only must never silently skip the rest in CI
  retries: 0, // no automatic retries: a flaky test should be seen and fixed, not hidden
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
