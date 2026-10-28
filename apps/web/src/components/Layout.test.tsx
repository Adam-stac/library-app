import { render, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json(401))),
    )
    renderLayout()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows who is signed in, and signing out ends the session with the CSRF token', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = renderLayout()

    expect(await screen.findByRole('button', { name: /^Your account,\s*reader@example\.com$/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Your account/ }))
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

    await user.click(await screen.findByRole('button', { name: /Your account/ }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you out")
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('keeps the page in place when the check of who is signed in finishes, so it is not built again', async () => {
    // A page built twice loses what it read once, such as the one-time token in a confirmation link
    let builds = 0
    function Page() {
      useEffect(() => {
        builds++
      }, [])
      return <p>page</p>
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
        ),
      ),
    )
    render(
      <MemoryRouter>
        <AuthProvider>
          <Layout>
            <Page />
          </Layout>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: /Your account/ })).toBeInTheDocument()
    expect(builds).toBe(1)
  })

  it('shows nothing until it knows who is signed in, so the page never jumps from one frame to the other', async () => {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    )
    renderLayout()

    const frame = screen.getByText('content').closest('main')?.parentElement
    expect(frame).toHaveClass('invisible')

    answer(json(200, { email: 'reader@example.com', language: 'en' }))
    expect(await screen.findByRole('button', { name: /Your account/ })).toBeInTheDocument()
    expect(frame).not.toHaveClass('invisible')
  })

  it('the account menu opens and closes, with the settings and signing out in it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
        ),
      ),
    )
    const user = renderLayout()

    const account = await screen.findByRole('button', { name: /Your account/ })
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()

    await user.click(account)
    expect(account).toHaveAttribute('aria-expanded', 'true')
    const menu = document.getElementById(account.getAttribute('aria-controls')!)!
    expect(within(menu).getByText('reader@example.com')).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()

    // Escape closes it and puts focus back on the button
    await user.keyboard('{Escape}')
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(account).toHaveFocus()

    // So does a click anywhere else
    await user.click(account)
    await user.click(screen.getByText('content'))
    expect(account).toHaveAttribute('aria-expanded', 'false')
  })

  it('switching language while signed in saves it to the account, for emails', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = renderLayout()

    await screen.findByRole('button', { name: /Your account/ })
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

  it('signed in, links only to the sections that exist, marking the one you are on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
        ),
      ),
    )
    renderLayout()

    const sections = await screen.findByRole('navigation', { name: 'Library' })
    const links = within(sections).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Search', '/search'],
      ['Books', '/books'],
      ['Benefits', '/benefits'],
      ['Authors', '/authors'],
      ['Places', '/places'],
      ['Sciences', '/sciences'],
      ['Settings', '/settings'],
    ])
    expect(within(sections).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })
  it('on a phone, keeps the rest of the sections behind More, which closes with Escape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
        ),
      ),
    )
    const user = renderLayout()

    const more = await screen.findByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    const list = screen.getByRole('list')
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/places', '/sciences', '/settings'])
    await user.keyboard('{Escape}')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveFocus()
  })

  it('on a phone, searches the library from any page, but not twice on the search page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/v1/auth/me' ? json(200, { email: 'reader@example.com', language: 'en' }) : json(204),
        ),
      ),
    )
    function Where() {
      const location = useLocation()
      return <p>at {location.pathname + location.search}</p>
    }
    render(
      <MemoryRouter initialEntries={['/books']}>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.type(await screen.findByRole('searchbox', { name: 'Search your library' }), 'bukhari{Enter}')
    expect(await screen.findByText('at /search?q=bukhari')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Search your library' })).not.toBeInTheDocument()
  })
})
