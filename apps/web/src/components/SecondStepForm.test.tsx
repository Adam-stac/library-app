import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import SignInPage from '../pages/SignInPage'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'

const PASSWORD = 'correct horse battery staple 42'

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

async function enterPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'reader@example.com')
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

const needsSecondStep = () => json(200, { email: null, language: null, secondStepRequired: true })

describe('Signing in with two-step verification', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the code after the password, then signs in', async () => {
    const api = fakeApi({
      '/api/v1/auth/login': needsSecondStep,
      '/api/v1/auth/login/2fa': () => json(200, { email: 'reader@example.com', language: 'en', secondStepRequired: false }),
    })
    const user = renderSignIn()

    await enterPassword(user)
    const code = await screen.findByLabelText('Code')
    expect(code).toHaveFocus()
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const init = callTo(api, '/api/v1/auth/login/2fa')
    expect(JSON.parse(init.body as string)).toEqual({ code: '123456' })
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('says when a code is wrong and lets you try again', async () => {
    fakeApi({
      '/api/v1/auth/login': needsSecondStep,
      '/api/v1/auth/login/2fa': () => json(400, { status: 400, code: 'invalid_code' }),
    })
    const user = renderSignIn()

    await enterPassword(user)
    await user.type(await screen.findByLabelText('Code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work.")
    expect(screen.getByLabelText('Code')).toHaveValue('')
    expect(screen.getByLabelText('Code')).toHaveFocus()
  })

  it('goes back to the password when the second step has expired', async () => {
    fakeApi({
      '/api/v1/auth/login': needsSecondStep,
      '/api/v1/auth/login/2fa': () => json(400, { status: 400, code: 'sign_in_again' }),
    })
    const user = renderSignIn()

    await enterPassword(user)
    await user.type(await screen.findByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in again.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})
