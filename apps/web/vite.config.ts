import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
})
