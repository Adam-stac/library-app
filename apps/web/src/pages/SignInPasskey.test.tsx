import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import SignInPage from './SignInPage'

const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', () => browser)

function renderSignIn() {
  render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/" element={<h1>Home</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Signing in with a passkey', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
    browser.startAuthentication.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('needs no email or password: the browser answers and the API signs you in', async () => {
    const api = fakeApi({
      '/api/v1/auth/passkeys/login/options': () => json(200, { challenge: 'xyz', rpId: 'localhost' }),
      '/api/v1/auth/passkeys/login': () => json(200, { email: 'reader@example.com', language: 'en', secondStepRequired: false }),
    })
    browser.startAuthentication.mockResolvedValue({ id: 'cred', response: { signature: 'sig' } })
    const user = renderSignIn()

    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'xyz', rpId: 'localhost' } })
    const init = callTo(api, '/api/v1/auth/passkeys/login')
    expect(JSON.parse(init.body as string)).toEqual({ credential: { id: 'cred', response: { signature: 'sig' } } })
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('explains a rejected passkey and keeps the password form available', async () => {
    fakeApi({
      '/api/v1/auth/passkeys/login/options': () => json(200, { challenge: 'xyz' }),
      '/api/v1/auth/passkeys/login': () => json(400, { status: 400, code: 'invalid_passkey' }),
    })
    browser.startAuthentication.mockResolvedValue({ id: 'cred' })
    const user = renderSignIn()

    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That passkey wasn't accepted.")
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('explains a closed prompt', async () => {
    fakeApi({ '/api/v1/auth/passkeys/login/options': () => json(200, { challenge: 'xyz' }) })
    browser.startAuthentication.mockRejectedValue(Object.assign(new Error('closed'), { name: 'NotAllowedError' }))
    const user = renderSignIn()

    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The passkey prompt was closed or timed out.')
  })
})
