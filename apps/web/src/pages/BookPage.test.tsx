import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import UndoProvider from '../components/UndoProvider'
import { today } from '../books'
import i18n from '../i18n'
import { BENEFIT, EDITION } from '../test/books'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BookPage from './BookPage'

const BOOK = '/api/v1/editions/e1'

function BooksList() {
  const location = useLocation()
  return (
    <>
      <h1>Books list</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/books/e1']}>
      <AuthProvider>
        <UndoProvider>
          <Routes>
            <Route path="/books" element={<BooksList />} />
            <Route path="/books/:id" element={<BookPage />} />
          </Routes>
        </UndoProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BookPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the title, authors and what was recorded about the copy', async () => {
    fakeApi({ [BOOK]: () => json(200, EDITION) }, 'r@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sahih al-Bukhari', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('صحيح البخاري')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'al-Bukhari' })).toHaveAttribute('href', '/authors/a1')
    expect(screen.getByText('Hadith')).toBeInTheDocument()
    expect(screen.getByText('دار طوق النجاة')).toBeInTheDocument()
    expect(screen.getByText('1422 AH')).toBeInTheDocument()
    expect(screen.getByText('12 March 2024')).toBeInTheDocument()
    expect(screen.getByText('£95.50')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All copies of this work' })).toHaveAttribute('href', '/books?work=w1')
  })

  it('leads with the science and volumes as labels, and the first four things known about the copy as tiles', async () => {
    fakeApi(
      {
        [BOOK]: () =>
          json(200, {
            ...EDITION,
            status: 'reading',
            bookmark: { volume: 3, page: 212, movedAt: '2026-10-20T10:00:00Z' },
          }),
      },
      'r@example.com',
    )
    renderPage()

    expect(await screen.findByRole('link', { name: 'Hadith' })).toHaveAttribute('href', '/sciences')
    expect(screen.getByText('9 volumes')).toBeInTheDocument()
    expect(screen.getAllByText('Reading')[0]).toBeInTheDocument()
    const copy = within(screen.getByRole('region', { name: 'About this copy' }))
    // Where it is on the shelf first, then what is known, four at most; the rest behind "All details"
    const tiles = copy
      .getAllByRole('term')
      .slice(0, 4)
      .map((term) => term.textContent)
    expect(tiles).toEqual(['Shelf', 'Publisher', 'Edited by (muḥaqqiq)', 'Place of publication'])
    expect(copy.getByText('All details').closest('details')).not.toHaveAttribute('open')
    // The page is one large figure for the eye; the words beside it say where you are
    const bookmark = within(screen.getByRole('region', { name: 'Bookmark' }))
    expect(bookmark.getByText('212')).toHaveAttribute('aria-hidden', 'true')
    expect(bookmark.getByText('Volume 3, page 212')).toBeInTheDocument()
  })

  it('starts reading today, keeping everything else as it was', async () => {
    const api = fakeApi(
      {
        [BOOK]: (init) =>
          init.method === 'PUT'
            ? json(200, { ...EDITION, startedOn: today(), status: 'reading', version: 5 })
            : json(200, EDITION),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Start reading today' }))

    expect(await screen.findByRole('button', { name: 'Finished today' })).toBeInTheDocument()
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')![1] as RequestInit
    expect((put.headers as Record<string, string>)['If-Match']).toBe('"4"')
    expect(JSON.parse(put.body as string)).toMatchObject({
      workId: 'w1',
      volumes: 9,
      muhaqqiq: 'محمد زهير الناصر',
      price: { amount: '95.50', currency: 'GBP' },
      startedOn: today(),
      finishedOn: null,
    })
  })

  it('puts the bookmark in a volume and page, and needs the volume for a set', async () => {
    const api = fakeApi(
      {
        [BOOK]: () => json(200, EDITION),
        [`${BOOK}/bookmark`]: () => json(200, { volume: 3, page: 120, movedAt: '2026-10-27T20:00:00Z' }),
      },
      'r@example.com',
    )
    const user = renderPage()

    const panel = within(await screen.findByRole('region', { name: 'Bookmark' }))
    expect(panel.getByText('No bookmark yet.')).toBeInTheDocument()
    await user.type(panel.getByLabelText('Page'), '١٢٠')
    await user.click(panel.getByRole('button', { name: 'Put the bookmark here' }))
    expect(panel.getByText('This book is a set: say which volume.')).toBeInTheDocument()

    await user.type(panel.getByLabelText('Volume'), '3')
    await user.click(panel.getByRole('button', { name: 'Put the bookmark here' }))
    expect(await panel.findByText('Volume 3, page 120')).toBeInTheDocument()
    const put = callTo(api, `${BOOK}/bookmark`)
    expect(put.method).toBe('PUT')
    expect((put.headers as Record<string, string>)['If-Match']).toBeUndefined()
    expect(JSON.parse(put.body as string)).toEqual({ volume: 3, page: 120 })
  })

  it('moves the book to the bin at once, its work too if it was the last copy, and Undo puts it back', async () => {
    const api = fakeApi(
      {
        [BOOK]: () => json(200, EDITION),
        [`${BOOK}?withWork=ifLast`]: () => json(204),
        '/api/v1/bin/e1/restore': () => json(200, { id: 'e1', kind: 'book' }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('heading', { name: 'Books list' })).toBeInTheDocument()
    expect(callTo(api, `${BOOK}?withWork=ifLast`).method).toBe('DELETE')
    expect(screen.getByText('Sahih al-Bukhari was moved to the bin.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await screen.findByRole('heading', { name: 'Sahih al-Bukhari', level: 1 })).toBeInTheDocument()
    expect(callTo(api, '/api/v1/bin/e1/restore').method).toBe('POST')
    expect(screen.getByText('Put back.')).toBeInTheDocument()
  })

  it('says why, if the book could not be deleted', async () => {
    fakeApi(
      {
        [BOOK]: () => json(200, EDITION),
        [`${BOOK}?withWork=ifLast`]: () => json(503, { code: 'busy' }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sahih al-Bukhari', level: 1 })).toBeInTheDocument()
  })

  it('shows the benefits from this book, and the way to add one', async () => {
    fakeApi(
      {
        [BOOK]: () => json(200, EDITION),
        '/api/v1/benefits?page=0&size=5&editionId=e1': () =>
          json(200, { items: [BENEFIT], page: 0, size: 5, total: 7 }),
      },
      'r@example.com',
    )
    renderPage()

    const benefits = within(await screen.findByRole('region', { name: 'Benefits from this book' }))
    expect(await benefits.findByText(/إنما الأعمال بالنيات/)).toBeInTheDocument()
    expect(benefits.getByRole('link', { name: 'Add a benefit' })).toHaveAttribute('href', '/benefits/new?book=e1')
    expect(benefits.getByRole('link', { name: 'All 7 benefits from this book' })).toHaveAttribute(
      'href',
      '/benefits?book=e1',
    )
  })

  it('says so when the book is not in your library', async () => {
    fakeApi({ [BOOK]: () => json(404, { code: 'not_found' }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("This book isn't in your library")
  })
})
