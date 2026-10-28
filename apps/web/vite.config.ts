import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * The fonts every page draws with, downloaded as soon as the page starts loading rather than once the stylesheet
 * asks for them, so they are usually here before the app first draws and text doesn't jump when they arrive: the
 * interface's Arabic and Latin letters, and Alexandria for Arabic headings (about 85 kB together).
 *
 * Lateef (about 130 kB for both weights) is not preloaded: on a slow connection it held the first page back by half
 * a second, measured. Layouts are built so that its arrival moves nothing (see PageHeader), and the layout-shift
 * check in the end-to-end tests holds them to that.
 */
const PRELOADED_FONTS = [
  /^readex-pro-arabic-wght-normal-.+\.woff2$/,
  /^geist-latin-wght-normal-.+\.woff2$/,
  /^alexandria-arabic-wght-normal-.+\.woff2$/,
]

function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const files = Object.keys(bundle ?? {}).map((file) => file.split('/').pop() ?? file)
        return PRELOADED_FONTS.map((pattern) => {
          const file = files.find((name) => pattern.test(name))
          if (!file) throw new Error(`No font file matches ${pattern}: has a font package changed its file names?`)
          return {
            tag: 'link',
            attrs: { rel: 'preload', href: `/assets/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          }
        })
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  build: {
    // Never inline assets as data: URIs. Small font files would otherwise be inlined, and our
    // Content-Security-Policy (font-src 'self') rightly blocks fonts that aren't served as files.
    assetsInlineLimit: 0,
  },
  server: {
    // In development, the web app forwards API calls to the Spring Boot app.
    // The browser only ever talks to one origin, so the API never needs CORS.
    proxy: {
      '/api': 'http://localhost:8080',
      '/actuator': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'], // e2e/ is for Playwright, not Vitest
    setupFiles: ['./src/test/setup.ts'],
    // Page tests type into forms and wait for searches. On a busy machine (many test files in parallel, as on a
    // laptop with many cores) the default 5 seconds can run out mid-typing; 15 still catches a real hang.
    testTimeout: 15_000,
  },
})
