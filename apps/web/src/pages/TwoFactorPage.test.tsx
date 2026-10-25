import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import TwoFactorPage from './TwoFactorPage'

const PASSWORD = 'correct horse battery staple 42'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const CODES = Array.from({ length: 10 }, (_, i) => `AAAA-BBBB-CCCC-${String(i).padStart(4, '0')}`)

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/two-step-verification']}>
      <AuthProvider>
        <Routes>
          <Route path="/two-step-verification" element={<TwoFactorPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('TwoFactorPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('turns it on: password, then QR code and key, then a code, then recovery codes shown once', async () => {
    let enabled = false
    const api = fakeApi(
      {
        '/api/v1/auth/2fa': () => json(200, { enabled, recoveryCodesLeft: enabled ? 10 : 0 }),
        '/api/v1/auth/2fa/totp/setup': () =>
          json(200, { secret: SECRET, otpauthUri: `otpauth://totp/Khizana:reader?secret=${SECRET}` }),
        '/api/v1/auth/2fa/totp/confirm': () => {
          enabled = true
          return json(200, { recoveryCodes: CODES })
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    expect(await screen.findByText('off')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await user.type(screen.getByLabelText('Current password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    expect(JSON.parse(callTo(api, '/api/v1/auth/2fa/totp/setup').body as string)).toEqual({ currentPassword: PASSWORD })

    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByRole('heading', { name: 'Your recovery codes' })).toHaveFocus()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText(CODES[0])).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "I've saved them" }))
    expect(await screen.findByText('on')).toBeInTheDocument()
    expect(screen.getByText('You have 10 recovery codes left.')).toBeInTheDocument()
    expect(screen.queryByText(CODES[0])).not.toBeInTheDocument()
  })

  it('shows a wrong password next to the field', async () => {
    fakeApi(
      {
        '/api/v1/auth/2fa': () => json(200, { enabled: false, recoveryCodesLeft: 0 }),
        '/api/v1/auth/2fa/totp/setup': () =>
          json(400, { status: 400, errors: [{ field: 'currentPassword', code: 'incorrect' }] }),
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Turn on' }))
    await user.type(screen.getByLabelText('Current password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText("That isn't your current password.")).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveFocus()
  })

  it('turns it off with the password and a code', async () => {
    let enabled = true
    const api = fakeApi(
      {
        '/api/v1/auth/2fa': () => json(200, { enabled, recoveryCodesLeft: enabled ? 7 : 0 }),
        '/api/v1/auth/2fa/totp/disable': () => {
          enabled = false
          return json(204)
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    expect(await screen.findByText('You have 7 recovery codes left.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    await user.type(screen.getByLabelText('Current password'), PASSWORD)
    await user.type(screen.getByLabelText('Code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Turn off' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Two-step verification is now off.')
    expect(JSON.parse(callTo(api, '/api/v1/auth/2fa/totp/disable').body as string)).toEqual({
      currentPassword: PASSWORD,
      code: '654321',
    })
  })
})
