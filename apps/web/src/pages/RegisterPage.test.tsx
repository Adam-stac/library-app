import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import RegisterPage from './RegisterPage'

const STRONG = 'correct horse battery staple 42'

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  )
}

function renderPage() {
  render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText(/email|البريد/i), email)
  if (password) await user.type(screen.getByLabelText(/^password$|^كلمة المرور$/i), password)
  await user.click(screen.getByRole('button', { name: /create account|إنشاء الحساب/i }))
}

describe('RegisterPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the details with the current language and shows a neutral "check your inbox" message', async () => {
    const fetchMock = respond(202)
    vi.stubGlobal('fetch', fetchMock)
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', STRONG)

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toHaveFocus()
    expect(screen.getByText(/If reader@example.com can be used to register/)).toBeInTheDocument()
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/v1/auth/register')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'reader@example.com', password: STRONG, language: 'en' })
  })

  it('checks required fields and password length before calling the API', async () => {
    const fetchMock = respond(202)
    vi.stubGlobal('fetch', fetchMock)
    const user = renderPage()

    await fillAndSubmit(user, '', 'short')

    expect(screen.getByText('This field is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(screen.getByText('Your password must be at least 15 characters.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('counts Arabic letters as one character each', async () => {
    const user = renderPage()

    await user.type(screen.getByLabelText('Password'), 'ابتثجحخدذرزسشصض')

    expect(screen.getByText('15 of 15 characters')).toBeInTheDocument()
  })

  it('shows API field errors next to the field, in the current language', async () => {
    await i18n.changeLanguage('ar')
    vi.stubGlobal('fetch', respond(400, { status: 400, errors: [{ field: 'password', code: 'compromised' }] }))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', STRONG)

    const password = screen.getByLabelText('كلمة المرور')
    expect(await screen.findByText(/ظهرت كلمة المرور هذه في تسريبات/)).toBeInTheDocument()
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password.getAttribute('aria-describedby')).toContain('password-error')
    expect(password).toHaveFocus()
  })

  it('explains rate limiting', async () => {
    vi.stubGlobal('fetch', respond(429, { status: 429, code: 'rate_limited' }))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', STRONG)

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('handles a network failure without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', STRONG)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't connect")
  })

  it('uses autocomplete hints so password managers work', () => {
    renderPage()

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
  })
})
