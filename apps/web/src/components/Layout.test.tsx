import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import Layout from './Layout'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function renderLayout() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Layout>
          <p>content</p>
        </Layout>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Layout account controls', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.cookie = 'XSRF-TOKEN=csrf-123; path=/'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers sign-in when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json(401))))
    renderLayout()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows who is signed in, and signing out ends the session with the CSRF token', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204)),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = renderLayout()

    expect(await screen.findByText('reader@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/v1/auth/logout') as unknown as [
      string,
      RequestInit,
    ]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('stays signed in and says so if signing out fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/v1/auth/me'
          ? Promise.resolve(json(200, { email: 'reader@example.com', language: 'en' }))
          : Promise.resolve(json(500)),
      ),
    )
    const user = renderLayout()

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you out")
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('switching language while signed in saves it to the account, for emails', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204)),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = renderLayout()

    await screen.findByText('reader@example.com')
    await user.click(screen.getByRole('button', { name: 'العربية' }))

    await vi.waitFor(() => expect(fetchMock.mock.calls.map(([path]) => path)).toContain('/api/v1/auth/preferences'))
    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/v1/auth/preferences') as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(init.body as string)).toEqual({ language: 'ar' })
    expect(i18n.language).toBe('ar')
    await i18n.changeLanguage('en')
  })

  it('switching language while signed out saves nothing', async () => {
    const fetchMock = vi.fn((_path: string) => Promise.resolve(json(204)))
    vi.stubGlobal('fetch', fetchMock)
    const user = renderLayout()

    await screen.findByRole('link', { name: 'Sign in' })
    await user.click(screen.getByRole('button', { name: 'العربية' }))

    expect(i18n.language).toBe('ar')
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('/api/v1/auth/preferences')
    await i18n.changeLanguage('en')
  })
})
