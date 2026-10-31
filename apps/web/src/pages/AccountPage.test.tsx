import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import AccountPage from './AccountPage'

const PASSWORD = 'correct horse battery staple 42'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/account']}>
      <AuthProvider>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account-deleted" element={<h1>Deleted page</h1>} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const twoStep = (enabled: boolean) => () => json(200, { enabled, recoveryCodesLeft: enabled ? 10 : 0 })

describe('AccountPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await i18n.changeLanguage('en')
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('saves the language to the account and switches the site', async () => {
    const api = fakeApi(
      { '/api/v1/auth/2fa': twoStep(false), '/api/v1/auth/preferences': () => json(204) },
      'reader@example.com',
    )
    const user = renderPage()
    // A way back to Settings, which lists this page
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')

    await user.click(await screen.findByRole('radio', { name: 'العربية' }))

    expect(await screen.findByRole('status')).toHaveTextContent('حُفظ')
    expect(i18n.language).toBe('ar')
    expect(JSON.parse(callTo(api, '/api/v1/auth/preferences').body as string)).toEqual({ language: 'ar' })
  })

  it('sends a link to the new address after the password is confirmed', async () => {
    const api = fakeApi(
      { '/api/v1/auth/2fa': twoStep(false), '/api/v1/auth/change-email': () => json(202) },
      'reader@example.com',
    )
    const user = renderPage()

    expect(await screen.findByLabelText('New email address')).toBeInTheDocument()
    expect(screen.getByText('reader@example.com')).toBeInTheDocument()
    expect(screen.queryAllByLabelText('Code from your authenticator app')).toHaveLength(0)
    await user.type(screen.getByLabelText('New email address'), ' new@example.org ')
    await user.type(screen.getAllByLabelText('Current password')[0], PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Send the link' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check the inbox of new@example.org')
    const request = callTo(api, '/api/v1/auth/change-email')
    expect(JSON.parse(request.body as string)).toEqual({ newEmail: 'new@example.org', currentPassword: PASSWORD })
    expect((request.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('asks for a code too when two-step verification is on, and shows a wrong password', async () => {
    fakeApi(
      {
        '/api/v1/auth/2fa': twoStep(true),
        '/api/v1/auth/change-email': () =>
          json(400, { code: 'invalid', errors: [{ field: 'currentPassword', code: 'incorrect' }], status: 400 }),
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.type(await screen.findByLabelText('New email address'), 'new@example.org')
    await user.type(screen.getAllByLabelText('Current password')[0], 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Send the link' }))
    expect(await screen.findAllByText('This field is required.')).toHaveLength(1)

    await user.type(screen.getAllByLabelText('Code from your authenticator app')[0], '123456')
    await user.click(screen.getByRole('button', { name: 'Send the link' }))

    expect(await screen.findByText("That isn't your current password.")).toBeInTheDocument()
    expect(screen.getAllByLabelText('Current password')[0]).toHaveValue('')
  })

  it('deletes the account only after the box is ticked and the password given', async () => {
    let deleted = false
    const api = fakeApi(
      {
        '/api/v1/auth/2fa': twoStep(false),
        '/api/v1/auth/me': () => json(deleted ? 204 : 200, deleted ? undefined : { email: 'reader@example.com', language: 'en' }),
        '/api/v1/auth/delete-account': () => {
          deleted = true
          return json(204)
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.type((await screen.findAllByLabelText('Current password'))[1], PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Tick the box to confirm.')).toBeInTheDocument()
    expect(api.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/delete-account')

    await user.click(screen.getByRole('checkbox', { name: "I understand this can't be undone" }))
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByRole('heading', { name: 'Deleted page' })).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/auth/delete-account').body as string)).toEqual({ currentPassword: PASSWORD })
  })
})
