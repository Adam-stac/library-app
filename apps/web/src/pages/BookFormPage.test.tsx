import { render, screen, waitFor, within } from '@testing-library/react'
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

  it('fills in your default currency when it arrives, even after you have started typing, unless you chose one', async () => {
    let settingsArrive: (response: Response) => void = () => {}
    fakeApi(
      {
        [SCIENCES]: sciences,
        '/api/v1/library-settings': () => new Promise<Response>((resolve) => (settingsArrive = resolve)),
      },
      'r@example.com',
    )
    const user = renderPage('/books/new')

    await user.type(await screen.findByLabelText('Title in Arabic'), 'صحيح البخاري')
    settingsArrive(json(200, { defaultCurrency: 'SAR' }))
    await waitFor(() => expect(screen.getByLabelText('Currency')).toHaveValue('SAR'))
    expect(screen.getByLabelText('Title in Arabic')).toHaveValue('صحيح البخاري')

    await user.selectOptions(screen.getByLabelText('Currency'), 'GBP')
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP')
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
  describe('"You already have this"', () => {
    const copy = {
      id: 'e1',
      work: WORK,
      title: null,
      volumes: 9,
      purchasedOn: null,
      status: 'not_started',
      bookmark: null,
    }
    const BY_ISBN = '/api/v1/editions/by-isbn?isbn=9780306406157'
    const settings = () => json(200, { defaultCurrency: null })

    it('names the copies you have of the ISBN you type, with a link to each', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [BY_ISBN]: () => json(200, { items: [copy] }) },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('ISBN'), 'ISBN 978-0-306-40615-7')

      expect(await screen.findByText('You already have this book:')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Sahih al-Bukhari' })).toHaveAttribute('href', '/books/e1')
    })

    it('asks nothing until the ISBN is whole and correct, and says nothing when you have no copy', async () => {
      const api = fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [BY_ISBN]: () => json(200, { items: [] }) },
        'r@example.com',
      )
      const user = renderPage('/books/new')
      const asked = () => api.mock.calls.some(([path]) => String(path).startsWith('/api/v1/editions/by-isbn'))

      await user.type(await screen.findByLabelText('ISBN'), '978030640615')
      await user.clear(screen.getByLabelText('ISBN'))
      await user.type(screen.getByLabelText('ISBN'), '978-0-306-40615-6') // wrong check digit
      await new Promise((resolve) => setTimeout(resolve, 450))
      expect(asked()).toBe(false)

      await user.clear(screen.getByLabelText('ISBN'))
      await user.type(screen.getByLabelText('ISBN'), '9780306406157')
      await waitFor(() => expect(asked()).toBe(true))
      expect(screen.queryByText('You already have this book:')).not.toBeInTheDocument()
    })

    it('reads Arabic digits, and the notice goes when the ISBN is changed', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [BY_ISBN]: () => json(200, { items: [copy] }) },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('ISBN'), 'ردمك ٩٧٨٠٣٠٦٤٠٦١٥٧')
      expect(await screen.findByText('You already have this book:')).toBeInTheDocument()
      await user.type(screen.getByLabelText('ISBN'), '1')
      await waitFor(() => expect(screen.queryByText('You already have this book:')).not.toBeInTheDocument())
    })

    it("leaves out the copy being edited, so a book is never told it's a duplicate of itself", async () => {
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/editions/e1': () => json(200, { ...EDITION, isbn: '9780306406157' }),
          '/api/v1/works/w1': () => json(200, { ...WORK, version: 2 }),
          [`${BY_ISBN}&excludeId=e1`]: () => json(200, { items: [] }),
        },
        'r@example.com',
      )
      renderPage('/books/e1/edit')

      await screen.findByLabelText('Title in English')
      await waitFor(() => expect(api.mock.calls.map(([path]) => path)).toContain(`${BY_ISBN}&excludeId=e1`))
      expect(screen.queryByText('You already have this book:')).not.toBeInTheDocument()
    })

    it('keeps quiet when the check fails: it is a help, not a gate', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [BY_ISBN]: () => json(500) },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('ISBN'), '9780306406157')
      await new Promise((resolve) => setTimeout(resolve, 450))

      expect(screen.queryByText('You already have this book:')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
  })
  describe('Filling in from the ISBN', () => {
    const ISBN = '9789933685027'
    const SUGGESTIONS = `/api/v1/editions/suggestions?isbn=${ISBN}`
    const settings = () => json(200, { defaultCurrency: null })
    const fromYourBooks = {
      publisher: { value: 'دار الغوثاني', from: 'yourBooks', country: null },
      publicationPlace: { value: 'دمشق', from: 'yourBooks', country: null },
      language: { value: 'ar', from: 'yourBooks', country: null },
    }
    const typeIsbn = async (user: ReturnType<typeof renderPage>, isbn = ISBN) =>
      user.type(await screen.findByLabelText('ISBN'), isbn)

    it('fills empty fields from your books, each with a note to check it (everyFilledFieldCarriesTheCheckNote)', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [SUGGESTIONS]: () => json(200, fromYourBooks) },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)

      expect(await screen.findByDisplayValue('دار الغوثاني')).toBeInTheDocument()
      for (const label of ['Publisher', 'Place of publication', 'Language']) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
          'May be incorrect, please check. From your books by the same publisher.',
        )
      }
      expect(screen.getByLabelText('Place of publication')).toHaveValue('دمشق')
      expect(screen.getByLabelText('Language')).toHaveValue('ar')
      expect(
        screen.getByText('Some fields were filled in for you, each saying where it came from. Please check them.'),
      ).toBeInTheDocument()
    })

    it('never replaces what you typed, and the note goes once you edit a filled field (fillingNeverReplacesWhatYouTyped)', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [SUGGESTIONS]: () => json(200, fromYourBooks) },
        'r@example.com',
      )
      const user = renderPage('/books/new')
      await user.type(await screen.findByLabelText('Publisher'), 'دار الفكر')

      await typeIsbn(user)
      await screen.findByDisplayValue('دمشق')

      expect(screen.getByLabelText('Publisher')).toHaveValue('دار الفكر')
      expect(screen.getByLabelText('Publisher')).not.toHaveAccessibleDescription(
        expect.stringContaining('please check'),
      )
      await user.type(screen.getByLabelText('Place of publication'), ' الشام')
      expect(screen.getByLabelText('Place of publication')).not.toHaveAccessibleDescription(
        expect.stringContaining('please check'),
      )
    })

    it('takes its suggestions back out when the ISBN changes to one with none', async () => {
      fakeApi(
        { [SCIENCES]: sciences, '/api/v1/library-settings': settings, [SUGGESTIONS]: () => json(200, fromYourBooks) },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)
      await screen.findByDisplayValue('دار الغوثاني')
      await user.type(screen.getByLabelText('ISBN'), '1') // no longer an ISBN

      await waitFor(() => expect(screen.getByLabelText('Publisher')).toHaveValue(''))
      expect(screen.getByLabelText('Language')).toHaveValue('')
    })

    it("names the ISBN's country when the language comes from it", async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [SUGGESTIONS]: () =>
            json(200, {
              publisher: null,
              publicationPlace: null,
              language: { value: 'ar', from: 'country', country: 'SY' },
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)

      await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('ar'))
      expect(screen.getByLabelText('Language')).toHaveAccessibleDescription(
        "May be incorrect, please check. From the ISBN's country: Syria.",
      )
      expect(screen.getByLabelText('Publisher')).toHaveValue('')
    })

    it('shows a suggested value as text, never as markup (scriptInASuggestedTitleIsShownAsText)', async () => {
      const hostile = '<img src=x onerror="window.hacked=1">'
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [SUGGESTIONS]: () =>
            json(200, {
              publisher: { value: hostile, from: 'yourBooks', country: null },
              publicationPlace: null,
              language: null,
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)

      expect(await screen.findByDisplayValue(hostile)).toBeInTheDocument()
      expect(document.querySelector('img[src="x"]')).toBeNull()
      expect((window as unknown as { hacked?: number }).hacked).toBeUndefined()
    })

    it('ignores an answer in the wrong shape, and a failed one', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [SUGGESTIONS]: () =>
            json(200, {
              publisher: { value: 42, from: 'yourBooks' },
              publicationPlace: 'دمشق',
              language: { value: 'ar', from: 'elsewhere' },
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)
      await new Promise((resolve) => setTimeout(resolve, 450))

      expect(screen.getByLabelText('Publisher')).toHaveValue('')
      expect(screen.getByLabelText('Place of publication')).toHaveValue('')
      expect(screen.getByLabelText('Language')).toHaveValue('')
    })

    it('fills nothing when you open a saved book, only once you change its ISBN', async () => {
      const other = '9789933685034'
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/editions/e1': () => json(200, { ...EDITION, isbn: ISBN, publisher: null, publicationPlace: null }),
          '/api/v1/works/w1': () => json(200, { ...WORK, version: 2 }),
          [`/api/v1/editions/suggestions?isbn=${other}&excludeId=e1`]: () => json(200, fromYourBooks),
        },
        'r@example.com',
      )
      const user = renderPage('/books/e1/edit')
      const asked = () => api.mock.calls.some(([path]) => String(path).startsWith('/api/v1/editions/suggestions'))

      await screen.findByLabelText('Title in English')
      await new Promise((resolve) => setTimeout(resolve, 450))
      expect(asked()).toBe(false)
      expect(screen.getByLabelText('Publisher')).toHaveValue('')

      await user.clear(screen.getByLabelText('ISBN'))
      await user.type(screen.getByLabelText('ISBN'), other)
      expect(await screen.findByDisplayValue('دار الغوثاني')).toBeInTheDocument()
    })

    it('says it in Arabic, naming the country in Arabic', async () => {
      await i18n.changeLanguage('ar')
      fakeApi(
        {
          '/api/v1/sciences?sort=ar': sciences,
          '/api/v1/library-settings': settings,
          [SUGGESTIONS]: () =>
            json(200, {
              publisher: null,
              publicationPlace: null,
              language: { value: 'ar', from: 'country', country: 'SY' },
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('ردمك (ISBN)'), ISBN)

      await waitFor(() =>
        expect(screen.getByText(/قد يكون هذا غير صحيح، يُرجى التحقق منه\. من بلد الردمك: سوريا\./)).toBeInTheDocument(),
      )
    })
  })
})
