import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import ForgotPasswordPage from './ForgotPasswordPage'

function renderPage() {
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('ForgotPasswordPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the email with the CSRF token and shows the same message whether or not there is an account', async () => {
    const api = fakeApi({ '/api/v1/auth/password-reset/request': () => json(202) })
    const user = renderPage()

    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toHaveFocus()
    expect(screen.getByText(/If reader@example.com has an account/)).toBeInTheDocument()
    const init = callTo(api, '/api/v1/auth/password-reset/request')
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'reader@example.com' })
  })

  it('needs an email before calling the API', async () => {
    const api = fakeApi({})
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(api).not.toHaveBeenCalled()
  })

  it('shows an invalid email next to the field', async () => {
    fakeApi({
      '/api/v1/auth/password-reset/request': () =>
        json(400, { status: 400, errors: [{ field: 'email', code: 'invalid_email' }] }),
    })
    const user = renderPage()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  })
})
