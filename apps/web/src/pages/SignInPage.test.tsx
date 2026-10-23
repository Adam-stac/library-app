import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import SignInPage from './SignInPage'

const PASSWORD = 'correct horse battery staple 42'
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** A fake API: not signed in, and /login answers with `login`. */
function stubApi(login: () => Response | Promise<Response>) {
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/v1/auth/me') return Promise.resolve(json(401))
    if (path === '/api/v1/auth/csrf') {
      document.cookie = 'XSRF-TOKEN=csrf-123; path=/'
      return Promise.resolve(json(204))
    }
    if (path === '/api/v1/auth/login') return Promise.resolve(login())
    return Promise.reject(new Error(`unexpected ${path}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
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

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignInPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches a CSRF token, sends it with the sign-in, and goes home when signed in', async () => {
    const fetchMock = stubApi(() => json(200, { email: 'reader@example.com', language: 'en' }))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', PASSWORD)

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const paths = fetchMock.mock.calls.map(([path]) => path)
    expect(paths.indexOf('/api/v1/auth/csrf')).toBeLessThan(paths.indexOf('/api/v1/auth/login'))
    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/v1/auth/login') as unknown as [
      string,
      RequestInit,
    ]
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'reader@example.com', password: PASSWORD })
  })

  it('shows one generic message for any failure, clears the password and focuses it', async () => {
    stubApi(() => json(400, { status: 400, code: 'invalid_credentials' }))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', 'a wrong password here')

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toHaveValue('reader@example.com')
  })

  it('checks required fields before calling the API', async () => {
    const fetchMock = stubApi(() => json(200))
    const user = renderPage()

    await fillAndSubmit(user, '', '')

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/login')
  })

  it('explains rate limiting', async () => {
    stubApi(() => json(429, { status: 429, code: 'rate_limited' }))
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', PASSWORD)

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('reports a network failure', async () => {
    stubApi(() => Promise.reject(new TypeError('Failed to fetch')) as never)
    const user = renderPage()

    await fillAndSubmit(user, 'reader@example.com', PASSWORD)

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't connect")
  })

  it('uses autocomplete hints so password managers fill it in', () => {
    stubApi(() => json(200))
    renderPage()

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})
