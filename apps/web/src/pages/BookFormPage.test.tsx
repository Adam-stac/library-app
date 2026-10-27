import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { EDITION, WORK } from '../test/books'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BookFormPage from './BookFormPage'

const SCIENCES = '/api/v1/sciences?sort=en'
const sciences = () =>
  json(200, {
    items: [
      { id: 's1', nameAr: 'الحديث', nameEn: 'Hadith', version: 0 },
      { id: 's2', nameAr: 'الفقه', nameEn: 'Fiqh', version: 0 },
    ],
    total: 2,
  })
const nothing = { items: [], total: 0 }
const searchFor = (text: string) => `/api/v1/search?q=${encodeURIComponent(text)}&limit=8`

function BookShown() {
  const location = useLocation()
  return (
    <>
      <h1>Book page</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/books/new" element={<BookFormPage mode="add" />} />
          <Route path="/books/:id/edit" element={<BookFormPage mode="edit" />} />
          <Route path="/books/:id" element={<BookShown />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BookFormPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds a book with a new work: authors found as you type, a science, and the default currency', async () => {
    const api = fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/library-settings': () => json(200, { defaultCurrency: 'SAR' }),
        [searchFor('بخ')]: () =>
          json(200, {
            authors: { items: [{ id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhari' }], total: 1 },
            places: nothing,
            works: nothing,
            editions: nothing,
            benefits: nothing,
          }),
        '/api/v1/editions': () => json(201, { ...EDITION, id: 'e9' }),
      },
      'r@example.com',
    )
    const user = renderPage('/books/new')

    const work = within(await screen.findByRole('group', { name: 'The work' }))
    await user.type(work.getByLabelText('Title in Arabic'), 'صحيح البخاري')
    await user.type(work.getByRole('combobox', { name: 'Authors' }), 'بخ')
    await user.click(await screen.findByRole('option', { name: /البخاري/ }))
    expect(work.getByRole('list', { name: 'Authors' })).toHaveTextContent('al-Bukhari')
    await user.selectOptions(work.getByLabelText('Science'), 'Hadith')
    await user.type(screen.getByLabelText('Volumes'), '٩')
    await user.type(screen.getByLabelText('Price paid'), '95.5')
    expect(screen.getByLabelText('Currency')).toHaveValue('SAR')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Book added.')).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/editions').body as string)).toMatchObject({
      work: { titleAr: 'صحيح البخاري', titleEn: null, scienceId: 's1', authorIds: ['a1'] },
      volumes: 9,
      price: { amount: '95.5', currency: 'SAR' },
      published: { hijri: null, ce: null },
      startedOn: null,
    })
  })

  it('adds another copy of a work you already have', async () => {
    const api = fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/library-settings': () => json(200, { defaultCurrency: null }),
        [searchFor('Sahih')]: () =>
          json(200, {
            authors: nothing,
            places: nothing,
            works: { items: [WORK], total: 1 },
            editions: nothing,
            benefits: nothing,
          }),
        '/api/v1/editions': () => json(201, { ...EDITION, id: 'e9' }),
      },
      'r@example.com',
    )
    const user = renderPage('/books/new')

    await user.type(await screen.findByRole('combobox', { name: /Another copy of a work/ }), 'Sahih')
    await user.click(await screen.findByRole('option', { name: /Sahih al-Bukhari/ }))
    expect(screen.queryByLabelText('Title in Arabic')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Title on the cover'), 'فتح الباري')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Book added.')
    const body = JSON.parse(callTo(api, '/api/v1/editions').body as string)
    expect(body).toMatchObject({ workId: 'w1', title: 'فتح الباري', price: null })
    expect(body.work).toBeUndefined()
  })

  it('checks the title, numbers, price and dates before sending anything', async () => {
    const api = fakeApi(
      { [SCIENCES]: sciences, '/api/v1/library-settings': () => json(200, { defaultCurrency: null }) },
      'r@example.com',
    )
    const user = renderPage('/books/new')

    await user.type(await screen.findByLabelText('Volumes'), '0')
    await user.type(screen.getByLabelText('Price paid'), '12')
    await user.type(screen.getByLabelText('Finished'), '2025-01-02')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Fill in the title in Arabic or in English.')).toBeInTheDocument()
    expect(screen.getByLabelText('Volumes')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Choose the currency of the price.')).toBeInTheDocument()
    expect(screen.getByText('A book you finished needs the date you started it.')).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === '/api/v1/editions')).toBe(false)
  })

  it("shows the API's errors next to the right fields", async () => {
    fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/library-settings': () => json(200, { defaultCurrency: null }),
        '/api/v1/editions': () => json(400, { errors: [{ field: 'isbn', code: 'invalid_isbn' }] }),
      },
      'r@example.com',
    )
    const user = renderPage('/books/new')

    await user.type(await screen.findByLabelText('Title in English'), 'Sahih')
    await user.type(screen.getByLabelText('ISBN'), '978-0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Check this ISBN/)).toBeInTheDocument()
    expect(screen.getByLabelText('ISBN')).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits a book: the work first if it changed, then the copy, each with the version it started from', async () => {
    const api = fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/editions/e1': (init) => (init.method === 'PUT' ? json(200, EDITION) : json(200, EDITION)),
        '/api/v1/works/w1': (init) =>
          init.method === 'PUT' ? json(200, { ...WORK, version: 3 }) : json(200, { ...WORK, version: 2 }),
      },
      'r@example.com',
    )
    const user = renderPage('/books/e1/edit')

    const english = await screen.findByLabelText('Title in English')
    expect(english).toHaveValue('Sahih al-Bukhari')
    expect(screen.getByLabelText('Volumes')).toHaveValue('9')
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP')
    await user.clear(english)
    await user.type(english, 'al-Jami al-Sahih')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    const calls = api.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(calls.map(([path]) => path)).toEqual(['/api/v1/works/w1', '/api/v1/editions/e1'])
    const [workPut, editionPut] = calls.map(([, init]) => init as RequestInit)
    expect((workPut.headers as Record<string, string>)['If-Match']).toBe('"2"')
    expect(JSON.parse(workPut.body as string)).toEqual({
      titleAr: 'صحيح البخاري',
      titleEn: 'al-Jami al-Sahih',
      scienceId: 's1',
      authorIds: ['a1'],
    })
    expect((editionPut.headers as Record<string, string>)['If-Match']).toBe('"4"')
    expect(JSON.parse(editionPut.body as string)).toMatchObject({
      workId: 'w1',
      price: { amount: '95.5', currency: 'GBP' },
    })
  })

  it('saves only the copy when the work is unchanged', async () => {
    const api = fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/editions/e1': () => json(200, EDITION),
        '/api/v1/works/w1': () => json(200, { ...WORK, version: 2 }),
      },
      'r@example.com',
    )
    const user = renderPage('/books/e1/edit')

    await user.type(await screen.findByLabelText('Shelf'), ', top')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Changes saved.')
    expect(api.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path)).toEqual([
      '/api/v1/editions/e1',
    ])
  })
})
