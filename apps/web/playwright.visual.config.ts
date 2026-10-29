import { defineConfig } from '@playwright/test'

// Screenshot and reflow tests (visual/): the built app with its API answered in the browser, so they need no server
// or database. Run `pnpm build` first. Screenshots are compared only in Playwright's Linux image: pnpm visual:docker.
const PORT = 4174

export default defineConfig({
  testDir: './visual',
  snapshotPathTemplate: '{testDir}/screenshots/{projectName}/{arg}{ext}',
  outputDir: './visual-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [[process.env.CI ? 'github' : 'list'], ['html', { outputFolder: 'visual-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  expect: {
    timeout: 20_000, // a long page is taken until two shots in a row match, which can take a while
    // A tiny allowance for anti-aliasing; a real change of layout or colour is far more than this
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    },
  ],
})
