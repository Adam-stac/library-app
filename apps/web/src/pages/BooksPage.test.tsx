import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { EDITION, WORK } from '../test/books'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BooksPage from './BooksPage'

const list = (sort: string, extra = '') => `/api/v1/editions?page=0&size=50&sort=${sort}${extra}`
const summary = (overrides: object) => ({ ...EDITION, ...overrides })

function renderPage(path = '/books') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/books" element={<BooksPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BooksPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the books as an index: title, authors, what you are reading, and the volumes of a set', async () => {
    const riyad = summary({
      id: 'e2',
      work: {
        ...WORK,
        id: 'w2',
        titleEn: 'Riyad al-Salihin',
        authors: [{ id: 'a3', nameAr: 'النووي', nameEn: 'al-Nawawi' }],
      },
      volumes: 1,
      status: 'reading',
    })
    fakeApi(
      { [list('en')]: () => json(200, { items: [riyad, EDITION], page: 0, size: 50, total: 2 }) },
      'r@example.com',
    )
    renderPage()

    expect(await screen.findByText('2 books')).toBeInTheDocument()
    expect(screen.getByText('Sahih al-Bukhari').closest('a')).toHaveAttribute('href', '/books/e1')
    expect(screen.getByText('al-Nawawi')).toBeInTheDocument()
    expect(screen.getByText('Reading')).toBeInTheDocument()
    expect(screen.getByText('9 volumes')).toBeInTheDocument()
    expect(screen.getByText('R')).toHaveAttribute('aria-hidden', 'true')
  })

  it('lists the newest first, without letters', async () => {
    const api = fakeApi(
      { [list('added')]: () => json(200, { items: [EDITION], page: 0, size: 50, total: 1 }) },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('link', { name: 'Newest first' }))
    expect(await screen.findByText('1 book')).toBeInTheDocument()
    expect(screen.queryByText('S')).not.toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === list('added'))).toBe(true)
  })

  it('shows the copies of one work', async () => {
    fakeApi(
      {
        [list('en', '&workId=w1')]: () => json(200, { items: [EDITION], page: 0, size: 50, total: 1 }),
        '/api/v1/works/w1': () => json(200, { ...WORK, version: 0 }),
      },
      'r@example.com',
    )
    renderPage('/books?work=w1')

    expect(await screen.findByText('Sahih al-Bukhari', { selector: 'bdi.text-ink' })).toBeInTheDocument()
    expect(screen.getByText(/Copies of/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All books' })).toHaveAttribute('href', '/books')
  })

  it('says when there are no books yet', async () => {
    fakeApi({ [list('en')]: () => json(200, { items: [], page: 0, size: 50, total: 0 }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByText("You haven't added any books yet.")).toBeInTheDocument()
  })
})
