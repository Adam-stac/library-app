import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import ConfirmEmailChangePage from './ConfirmEmailChangePage'

const TOKEN = 'a'.repeat(43)

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <ConfirmEmailChangePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ConfirmEmailChangePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
    window.history.replaceState(null, '', `/confirm-email-change#token=${TOKEN}`)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('confirms the token from the link once, with the CSRF token, and removes it from the address bar', async () => {
    const api = fakeApi({ '/api/v1/auth/confirm-email-change': () => json(204) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Your email address has been changed' })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    const request = callTo(api, '/api/v1/auth/confirm-email-change')
    expect(JSON.parse(request.body as string)).toEqual({ token: TOKEN })
    expect((request.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
    expect(api.mock.calls.filter(([path]) => path === '/api/v1/auth/confirm-email-change')).toHaveLength(1)
  })

  it('explains a link that no longer works', async () => {
    fakeApi({ '/api/v1/auth/confirm-email-change': () => json(400, { code: 'invalid_token', status: 400 }) })
    renderPage()

    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/account')
  })
})
