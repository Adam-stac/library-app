import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BinPage from './BinPage'

const BOOK = {
  id: 'e1',
  kind: 'book',
  title: null,
  titleAr: 'صحيح البخاري',
  titleEn: 'Sahih al-Bukhari',
  excerpt: null,
  deletedAt: '2026-10-20T10:00:00Z',
  removedAt: '2026-11-19T10:00:00Z',
}
const BENEFIT = {
  id: 'b1',
  kind: 'benefit',
  title: null,
  titleAr: null,
  titleEn: null,
  excerpt: 'إنما الأعمال بالنيات',
  deletedAt: '2026-10-21T10:00:00Z',
  removedAt: '2026-11-20T10:00:00Z',
}
const contents = (items: unknown[]) => json(200, { items, total: items.length, keptDays: 30 })

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/bin']}>
      <AuthProvider>
        <Routes>
          <Route path="/bin" element={<BinPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BinPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists what was deleted, with when it goes for good', async () => {
    fakeApi({ '/api/v1/bin': () => contents([BENEFIT, BOOK]) }, 'r@example.com')
    renderPage()

    expect(await screen.findByText('2 items')).toBeInTheDocument()
    expect(screen.getByText(/stay here for 30 days/)).toBeInTheDocument()
    const [benefit, book] = screen.getAllByRole('article')
    expect(within(benefit).getByText('إنما الأعمال بالنيات')).toBeInTheDocument()
    expect(within(book).getByRole('heading', { name: 'Sahih al-Bukhari' })).toBeInTheDocument()
    expect(within(book).getByText(/Deleted for good on 19 November 2026/)).toBeInTheDocument()
  })

  it('puts a book back, and links to it', async () => {
    let restored = false
    const api = fakeApi(
      {
        '/api/v1/bin': () => contents(restored ? [] : [BOOK]),
        '/api/v1/bin/e1/restore': () => {
          restored = true
          return json(200, { id: 'e1', kind: 'book' })
        },
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Put back Sahih al-Bukhari' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Sahih al-Bukhari was put back. Open it')
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/books/e1')
    expect(callTo(api, '/api/v1/bin/e1/restore').method).toBe('POST')
    expect(await screen.findByText('The bin is empty.')).toBeInTheDocument()
  })

  it('says why a book could not be put back', async () => {
    fakeApi(
      {
        '/api/v1/bin': () => contents([BOOK]),
        '/api/v1/bin/e1/restore': () => json(409, { code: 'work_gone' }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Put back Sahih al-Bukhari' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/deleted for good, so this book can't be put back/)
  })

  it('deletes one for good, and empties the bin, each after asking', async () => {
    let items: unknown[] = [BENEFIT, BOOK]
    const api = fakeApi(
      {
        '/api/v1/bin': (init) => {
          if (init.method === 'DELETE') items = []
          return init.method === 'DELETE' ? json(204) : contents(items)
        },
        '/api/v1/bin/b1': () => {
          items = [BOOK]
          return json(204)
        },
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete for good Benefit' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText('1 item')).toBeInTheDocument()
    expect(callTo(api, '/api/v1/bin/b1').method).toBe('DELETE')

    await user.click(screen.getByRole('button', { name: 'Empty the bin' }))
    expect(screen.getByText(/Delete everything in the bin for good/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByRole('status')).toHaveTextContent('The bin was emptied.')
    expect(await screen.findByText('The bin is empty.')).toBeInTheDocument()
  })
})
