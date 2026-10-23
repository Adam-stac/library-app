import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import ResetPasswordPage from './ResetPasswordPage'

const NEW_PASSWORD = 'a brand new passphrase for 2026'
const TOKEN = 'A'.repeat(43)

function openFromEmail(hash = `#token=${TOKEN}`) {
  window.history.replaceState(null, '', `/reset-password${hash}`)
  render(
    <MemoryRouter>
      <AuthProvider>
        <ResetPasswordPage />
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function choose(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(screen.getByLabelText('New password'), password)
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
}

describe('ResetPasswordPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('removes the token from the address bar straight away', () => {
    fakeApi({})
    openFromEmail()

    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('sends the token and new password, then asks you to sign in again', async () => {
    const api = fakeApi({ '/api/v1/auth/password-reset/confirm': () => json(204) })
    const user = openFromEmail()

    await choose(user, NEW_PASSWORD)

    expect(await screen.findByRole('heading', { name: 'Your password has been changed' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    const init = callTo(api, '/api/v1/auth/password-reset/confirm')
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN, password: NEW_PASSWORD })
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('checks the length before calling the API', async () => {
    const api = fakeApi({})
    const user = openFromEmail()

    await choose(user, 'too short')

    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Your password must be at least 15 characters.')).toBeInTheDocument()
    expect(api.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/password-reset/confirm')
  })

  it('explains a breached password and keeps the form', async () => {
    fakeApi({
      '/api/v1/auth/password-reset/confirm': () =>
        json(400, { status: 400, errors: [{ field: 'password', code: 'compromised' }] }),
    })
    const user = openFromEmail()

    await choose(user, 'password1234567890')

    expect(await screen.findByText(/appeared in known data breaches/)).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveFocus()
  })

  it('offers a new link when this one is used or expired', async () => {
    fakeApi({ '/api/v1/auth/password-reset/confirm': () => json(400, { status: 400, code: 'invalid_token' }) })
    const user = openFromEmail()

    await choose(user, NEW_PASSWORD)

    expect(await screen.findByRole('heading', { name: 'This link is invalid or has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows the invalid-link message when opened without a token', () => {
    fakeApi({})
    openFromEmail('')

    expect(screen.getByRole('heading', { name: 'This link is invalid or has expired' })).toBeInTheDocument()
  })
})
