import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import HomePage from './HomePage'

const work = (id: string, titleEn: string) => ({ id, titleAr: null, titleEn, science: null, authors: [] })
const SUMMARY = {
  counts: { books: 12, works: 10, authors: 8, benefits: 4, reading: 2 },
  thisYear: {
    year: 2026,
    started: 3,
    finished: 1,
    spent: [
      { currency: 'GBP', amount: '95.50' },
      { currency: 'SAR', amount: '450.00' },
    ],
  },
  bySciences: [
    { science: { id: 's1', nameAr: 'الحديث', nameEn: 'Hadith' }, books: 9, percent: 75 },
    { science: null, books: 3, percent: 25 },
  ],
  notStarted: [
    {
      id: 'e3',
      title: null,
      volumes: 1,
      purchasedOn: '2024-03-12',
      startedOn: null,
      work: work('w3', 'Riyad al-Salihin'),
    },
  ],
  quiet: [],
  recentBookmarks: [
    {
      editionId: 'e2',
      work: work('w2', 'Fath al-Bari'),
      title: null,
      volumes: 13,
      bookmark: { volume: 3, page: 212, movedAt: '2026-10-20T10:00:00Z' },
    },
  ],
  recentBenefits: [
    {
      id: 'b1',
      text: 'إنما الأعمال بالنيات.',
      edition: null,
      volume: null,
      page: null,
      source: 'hasib',
      version: 0,
      createdAt: '2026-10-20T10:00:00Z',
    },
  ],
}

function Where() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <HomePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signed out: says what the app is, with creating an account and signing in', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'The index of your library', level: 1 })).toBeInTheDocument()
    // An example of the index, with nothing in it to click
    const example = screen.getByRole('figure', { name: /^An example of how Khizāna shows your library/ })
    expect(example).toHaveTextContent('al-Bukhārī')
    expect(example).toHaveTextContent('d. 256 AH')
    expect(example).toHaveTextContent('Volume 3, page 212')
    expect(example.querySelector('a')).toBeNull()
    for (const link of screen.getAllByRole('link', { name: 'Create an account' })) {
      expect(link).toHaveAttribute('href', '/register')
    }
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })

  it('signed in: the library in a sentence, where you are, the sciences and this year', async () => {
    fakeApi({ '/api/v1/home': () => json(200, SUMMARY) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByText(/Your library holds 12 books and 8 authors\./)).toHaveTextContent(
      'You are reading 2 of them.',
    )
    const where = within(screen.getByRole('region', { name: 'Where you are' }))
    expect(where.getByText('Fath al-Bari').closest('a')).toHaveAttribute('href', '/books/e2')
    expect(where.getByText('Volume 3, page 212')).toBeInTheDocument()
    const sciences = within(screen.getByRole('region', { name: 'Your library by science' }))
    expect(sciences.getByText('Hadith')).toBeInTheDocument()
    expect(sciences.getByText('75%')).toBeInTheDocument()
    expect(sciences.getByText('9 books')).toBeInTheDocument()
    expect(sciences.getByText('No science')).toBeInTheDocument()
    const year = within(screen.getByRole('region', { name: 'In 2026' }))
    expect(year.getByText('Books finished').nextSibling).toHaveTextContent('1')
    expect(year.getByText('£95.50')).toBeInTheDocument()
    expect(year.getByText('SAR 450.00')).toBeInTheDocument()
    const notStarted = within(screen.getByRole('region', { name: 'Bought, not yet started' }))
    expect(notStarted.getByText('Riyad al-Salihin').closest('a')).toHaveAttribute('href', '/books/e3')
    expect(notStarted.getByText('12 March 2024')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gone quiet' })).not.toBeInTheDocument()
    const benefits = within(screen.getByRole('region', { name: 'Latest benefits' }))
    expect(benefits.getByText('إنما الأعمال بالنيات.')).toBeInTheDocument()
    expect(benefits.getByText('From Ḥāsib')).toBeInTheDocument()
    expect(benefits.getByRole('link', { name: 'All 4 benefits' })).toHaveAttribute('href', '/benefits')
  })

  it('leads with the book you are reading: its page as a figure, its volumes, and what to do next', async () => {
    fakeApi({ '/api/v1/home': () => json(200, SUMMARY) }, 'reader@example.com')
    renderPage()

    const where = within(await screen.findByRole('region', { name: 'Where you are' }))
    // The figure is for the eye; the place is written out for screen readers
    expect(where.getByText('Volume 3, page 212')).toHaveClass('sr-only')
    expect(where.getByText('Volume 3 of 13').closest('[aria-hidden]')).not.toBeNull()
    expect(where.getByRole('link', { name: 'Move the bookmark' })).toHaveAttribute('href', '/books/e2')
    expect(where.getByRole('link', { name: 'Note a benefit from it' })).toHaveAttribute('href', '/benefits/new?book=e2')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back,Where are you in your reading?')
  })

  it('with nothing being read, offers to choose a book from the shelf', async () => {
    fakeApi({ '/api/v1/home': () => json(200, { ...SUMMARY, recentBookmarks: [] }) }, 'reader@example.com')
    renderPage()

    const where = within(await screen.findByRole('region', { name: 'Where you are' }))
    expect(where.getByRole('link', { name: 'Choose a book from your shelf' })).toHaveAttribute('href', '/books')
    expect(screen.queryByRole('region', { name: 'Also reading' })).not.toBeInTheDocument()
  })

  it('searches the library from under the greeting', async () => {
    fakeApi({ '/api/v1/home': () => json(200, SUMMARY) }, 'reader@example.com')
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<Where />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.type(await screen.findByRole('searchbox', { name: 'Search your library' }), 'bukhari')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('at /search?q=bukhari')).toBeInTheDocument()
  })

  it('puts the sciences past the fifth together, so the ring has no more than six slices', async () => {
    const science = (i: number) => ({
      science: { id: `s${i}`, nameAr: null, nameEn: `Science ${i}` },
      books: 1,
      percent: 10,
    })
    fakeApi(
      {
        '/api/v1/home': () => json(200, { ...SUMMARY, bySciences: [1, 2, 3, 4, 5, 6, 7, 8].map(science) }),
      },
      'reader@example.com',
    )
    renderPage()

    const sciences = within(await screen.findByRole('region', { name: 'Your library by science' }))
    expect(sciences.getAllByRole('listitem')).toHaveLength(6)
    expect(sciences.getByText('Other sciences').closest('li')).toHaveTextContent('3 books30%')
  })

  it('signed in with an empty library: the way to add the first book', async () => {
    fakeApi(
      {
        '/api/v1/home': () =>
          json(200, {
            ...SUMMARY,
            counts: { books: 0, works: 0, authors: 0, benefits: 0, reading: 0 },
            bySciences: [],
            notStarted: [],
            recentBookmarks: [],
          }),
      },
      'reader@example.com',
    )
    renderPage()

    expect(await screen.findByText(/Your library is empty/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a book' })).toHaveAttribute('href', '/books/new')
    expect(screen.getByRole('link', { name: 'Add an author' })).toHaveAttribute('href', '/authors/new')
  })

  it('says so when the summary could not be loaded', async () => {
    fakeApi({ '/api/v1/home': () => json(500) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this")
  })
})
