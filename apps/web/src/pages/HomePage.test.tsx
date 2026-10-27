import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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
  recentBenefits: [],
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

    expect(await screen.findByRole('heading', { name: 'Welcome', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
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
    expect(sciences.getByText('75% (9 books)')).toBeInTheDocument()
    expect(sciences.getByText('No science')).toBeInTheDocument()
    const year = within(screen.getByRole('region', { name: 'In 2026' }))
    expect(year.getByText('Books finished').nextSibling).toHaveTextContent('1')
    expect(year.getByText('£95.50, SAR 450.00')).toBeInTheDocument()
    const notStarted = within(screen.getByRole('region', { name: 'Bought, not yet started' }))
    expect(notStarted.getByText('Riyad al-Salihin').closest('a')).toHaveAttribute('href', '/books/e3')
    expect(notStarted.getByText('12 March 2024')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gone quiet' })).not.toBeInTheDocument()
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
