import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import ChangePasswordPage from './ChangePasswordPage'

const CURRENT = 'correct horse battery staple 42'
const NEW_PASSWORD = 'a brand new passphrase for 2026'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function change(user: ReturnType<typeof userEvent.setup>, current: string, newPassword: string) {
  if (current) await user.type(await screen.findByLabelText('Current password'), current)
  if (newPassword) await user.type(await screen.findByLabelText('New password'), newPassword)
  await user.click(await screen.findByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordPage', () => {
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

  it('changes the password with the CSRF token and confirms it', async () => {
    const api = fakeApi({ '/api/v1/auth/change-password': () => json(204) }, 'reader@example.com')
    const user = renderPage()
    // A way back to Settings, which lists this page
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')

    await change(user, CURRENT, NEW_PASSWORD)

    expect(await screen.findByRole('heading', { name: 'Your password has been changed' })).toHaveFocus()
    const init = callTo(api, '/api/v1/auth/change-password')
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: CURRENT, newPassword: NEW_PASSWORD })
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('says when the current password is wrong, and clears it', async () => {
    fakeApi(
      {
        '/api/v1/auth/change-password': () =>
          json(400, { status: 400, errors: [{ field: 'currentPassword', code: 'incorrect' }] }),
      },
      'reader@example.com',
    )
    const user = renderPage()

    await change(user, 'not my password', NEW_PASSWORD)

    expect(await screen.findByText("That isn't your current password.")).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('Current password')).toHaveFocus()
  })

  it('checks both fields before calling the API', async () => {
    const api = fakeApi({}, 'reader@example.com')
    const user = renderPage()

    await change(user, '', 'short')

    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(api.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/change-password')
  })

  it('uses autocomplete hints so password managers save the new password', async () => {
    fakeApi({}, 'reader@example.com')
    renderPage()

    expect(await screen.findByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
  })
})
