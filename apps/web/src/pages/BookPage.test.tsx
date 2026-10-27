import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import { today } from '../books'
import i18n from '../i18n'
import { EDITION } from '../test/books'
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
        <Routes>
          <Route path="/books" element={<BooksList />} />
          <Route path="/books/:id" element={<BookPage />} />
        </Routes>
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

  it('deletes the last copy of a work, and the work with it', async () => {
    const api = fakeApi(
      {
        [BOOK]: (init) => (init.method === 'DELETE' ? json(204) : json(200, EDITION)),
        '/api/v1/editions?page=0&size=1&sort=added&workId=w1': () =>
          json(200, { items: [], page: 0, size: 1, total: 0 }),
        '/api/v1/works/w1': () => json(204),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/Benefits from it are kept/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText('Sahih al-Bukhari was deleted.')).toBeInTheDocument()
    expect(callTo(api, '/api/v1/works/w1').method).toBe('DELETE')
  })

  it('keeps the work when other copies of it remain', async () => {
    const api = fakeApi(
      {
        [BOOK]: (init) => (init.method === 'DELETE' ? json(204) : json(200, EDITION)),
        '/api/v1/editions?page=0&size=1&sort=added&workId=w1': () =>
          json(200, { items: [{ ...EDITION, id: 'e2' }], page: 0, size: 1, total: 1 }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { name: 'Books list' })).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === '/api/v1/works/w1')).toBe(false)
  })

  it('says so when the book is not in your library', async () => {
    fakeApi({ [BOOK]: () => json(404, { code: 'not_found' }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("This book isn't in your library")
  })
})
