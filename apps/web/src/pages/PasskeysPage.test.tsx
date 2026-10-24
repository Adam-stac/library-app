import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import PasskeysPage from './PasskeysPage'

const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', () => browser)

const PASSWORD = 'correct horse battery staple 42'
const PHONE = { id: '7d4c0b5e-0d7f-4a2e-9a55-1f0d3c1b2a11', label: 'Phone', createdAt: '2026-10-20T10:00:00Z', lastUsedAt: null }

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/passkeys']}>
      <AuthProvider>
        <Routes>
          <Route path="/passkeys" element={<PasskeysPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('PasskeysPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
    browser.startRegistration.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('adds a passkey: name and password, then the browser prompt, then the API checks it', async () => {
    let saved = false
    const api = fakeApi(
      {
        '/api/v1/auth/passkeys': () => json(200, saved ? [PHONE] : []),
        '/api/v1/auth/passkeys/register/options': () => json(200, { challenge: 'abc', rp: { id: 'localhost', name: 'My Library' } }),
        '/api/v1/auth/passkeys/register': () => {
          saved = true
          return json(201, PHONE)
        },
      },
      'reader@example.com',
    )
    browser.startRegistration.mockResolvedValue({ id: 'cred', response: {} })
    const user = renderPage()

    expect(await screen.findByText("You haven't added a passkey yet.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))
    await user.type(screen.getByLabelText('Name'), 'Phone')
    await user.type(screen.getByLabelText('Current password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('status')).toHaveTextContent('“Phone” was added.')
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc', rp: { id: 'localhost', name: 'My Library' } } })
    expect(JSON.parse(callTo(api, '/api/v1/auth/passkeys/register/options').body as string)).toEqual({ currentPassword: PASSWORD })
    const register = callTo(api, '/api/v1/auth/passkeys/register')
    expect(JSON.parse(register.body as string)).toEqual({ label: 'Phone', credential: { id: 'cred', response: {} } })
    expect((register.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('explains a cancelled browser prompt and saves nothing', async () => {
    const api = fakeApi(
      {
        '/api/v1/auth/passkeys': () => json(200, []),
        '/api/v1/auth/passkeys/register/options': () => json(200, { challenge: 'abc' }),
      },
      'reader@example.com',
    )
    browser.startRegistration.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }))
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add a passkey' }))
    await user.type(screen.getByLabelText('Name'), 'Phone')
    await user.type(screen.getByLabelText('Current password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The passkey prompt was closed or timed out.')
    expect(api.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/passkeys/register')
  })

  it('removes a passkey after the password is confirmed', async () => {
    let removed = false
    const api = fakeApi(
      {
        '/api/v1/auth/passkeys': () => json(200, removed ? [] : [PHONE]),
        [`/api/v1/auth/passkeys/${PHONE.id}/delete`]: () => {
          removed = true
          return json(204)
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    expect(await screen.findByText(/Added 20 Oct 2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Phone' }))
    await user.type(screen.getByLabelText('Current password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByRole('status')).toHaveTextContent('“Phone” was removed.')
    expect(JSON.parse(callTo(api, `/api/v1/auth/passkeys/${PHONE.id}/delete`).body as string)).toEqual({
      currentPassword: PASSWORD,
    })
  })
})
