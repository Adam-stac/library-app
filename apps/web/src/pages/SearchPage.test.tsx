import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { WORK } from '../test/books'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import SearchPage from './SearchPage'

const none = { items: [], total: 0 }
const RESULTS = {
  authors: { items: [{ id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhari' }], total: 1 },
  places: { items: [{ id: 'p2', nameAr: 'بخارى', nameEn: 'Bukhara' }], total: 1 },
  works: { items: [WORK], total: 1 },
  editions: { items: [{ id: 'e1', title: null, volumes: 9, work: WORK }], total: 12 },
  benefits: {
    items: [{ id: 'b1', excerpt: 'قال البخاري', shortened: true, editionId: 'e1', createdAt: '2026-10-20T10:00:00Z' }],
    total: 1,
  },
}

function renderPage(path = '/search') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SearchPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searches the whole library, keeping the search in the address', async () => {
    const api = fakeApi(
      { '/api/v1/search?q=%D8%A8%D8%AE%D8%A7%D8%B1%D9%8A&limit=10': () => json(200, RESULTS) },
      'r@example.com',
    )
    const user = renderPage()

    await user.type(await screen.findByRole('searchbox', { name: 'Search your library' }), 'بخاري')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('status')).toHaveTextContent('16 matches for “بخاري”')
    expect(api.mock.calls.some(([path]) => String(path).startsWith('/api/v1/search?q='))).toBe(true)
    const books = within(screen.getByRole('region', { name: /Books/ }))
    expect(books.getByText('1 of 12')).toBeInTheDocument()
    expect(books.getByRole('link', { name: /Sahih al-Bukhari/ })).toHaveAttribute('href', '/books/e1')
    expect(within(screen.getByRole('region', { name: /Works/ })).getByRole('link')).toHaveAttribute(
      'href',
      '/books?work=w1',
    )
    expect(within(screen.getByRole('region', { name: /Authors/ })).getByRole('link')).toHaveAttribute(
      'href',
      '/authors/a1',
    )
    expect(within(screen.getByRole('region', { name: /Places/ })).getByRole('link')).toHaveAttribute(
      'href',
      '/places/p2',
    )
    const benefit = within(screen.getByRole('region', { name: /Benefits/ })).getByRole('link')
    expect(benefit).toHaveAttribute('href', '/benefits/b1')
    expect(benefit).toHaveTextContent('قال البخاري…')
  })

  it('says when nothing matches', async () => {
    fakeApi(
      {
        '/api/v1/search?q=zzz&limit=10': () =>
          json(200, { authors: none, places: none, works: none, editions: none, benefits: none }),
      },
      'r@example.com',
    )
    renderPage('/search?q=zzz')
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing matches “zzz”.')
  })

  it('sends nothing for a search with no letters or digits', async () => {
    const api = fakeApi({}, 'r@example.com')
    renderPage('/search?q=%2B%2B')
    expect(await screen.findByRole('searchbox')).toHaveValue('++')
    expect(api.mock.calls.some(([path]) => String(path).startsWith('/api/v1/search'))).toBe(false)
  })
})
