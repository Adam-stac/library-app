import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
          'Please confirm. From your books by the same publisher.',
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
        "Please confirm. From the ISBN's country: Syria.",
      )
      expect(screen.getByLabelText('Publisher')).toHaveValue('')
    })

    it("says when the language comes from an Arabic publisher on another country's code", async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [SUGGESTIONS]: () =>
            json(200, {
              publisher: null,
              publicationPlace: null,
              language: { value: 'ar', from: 'publisher', country: 'LB' },
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await typeIsbn(user)

      await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('ar'))
      expect(screen.getByLabelText('Language')).toHaveAccessibleDescription(
        "Please confirm. From the ISBN's publisher, an Arabic publisher in Lebanon.",
      )
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
        expect(screen.getByText(/يُرجى التأكد منه\. من بلد الردمك: سوريا\./)).toBeInTheDocument(),
      )
    })
  })
  describe("From the scholars' catalogue", () => {
    const TYPED = 'صحيج البخاري'
    const CATALOGUE = `/api/v1/reference/works?q=${encodeURIComponent(TYPED)}&limit=5`
    const settings = () => json(200, { defaultCurrency: null })
    const bukhari = {
      id: 'Q38190',
      nameAr: 'محمد بن إسماعيل البخاري',
      nameEn: 'Muhammad al-Bukhari',
      deathHijri: 256,
      deathCe: 870,
    }
    const sahih = { id: 'Q209017', titleAr: 'صحيح البخاري', titleEn: 'Sahih al-Bukhari', authors: [bukhari] }
    const yours = { id: 'a9', nameAr: 'البخاري', nameEn: null }
    const searchFor = (q: string) => `/api/v1/search?q=${encodeURIComponent(q)}&limit=5`
    const noAuthors = () => json(200, { authors: { items: [], total: 0 } })
    const CHECK = "Please confirm. From the scholars' catalogue (Wikidata)."

    it('offers classical works as you type a title, and choosing one fills the titles with a note to check', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [CATALOGUE]: () => json(200, { items: [sahih] }),
          [searchFor(bukhari.nameAr)]: noAuthors,
          [searchFor(bukhari.nameEn)]: noAuthors,
          [searchFor('البخاري')]: noAuthors,
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('Title in Arabic'), TYPED)
      const offers = await screen.findByRole('region', { name: "From the scholars' catalogue" })
      expect(within(offers).getByRole('link', { name: 'About the data' })).toHaveAttribute('href', '/about/data')
      await user.click(within(offers).getByRole('button', { name: /صحيح البخاري/ }))

      expect(screen.getByLabelText('Title in Arabic')).toHaveValue('صحيح البخاري')
      expect(screen.getByLabelText('Title in English')).toHaveValue('Sahih al-Bukhari')
      expect(screen.getByLabelText('Title in Arabic')).toHaveAccessibleDescription(CHECK)
      expect(screen.getByLabelText('Title in English')).toHaveAccessibleDescription(CHECK)
      expect(screen.queryByRole('region', { name: "From the scholars' catalogue" })).not.toBeInTheDocument()
      expect(screen.getByText('Author in the catalogue: Muhammad al-Bukhari (d. 256 AH)')).toBeInTheDocument()

      // Editing a filled title makes it yours, and its note goes
      await user.type(screen.getByLabelText('Title in English'), ' (Beirut)')
      expect(screen.getByLabelText('Title in English')).not.toHaveAccessibleDescription(
        expect.stringContaining('check'),
      )
    })

    it('offers your own author who may be the scholar, and uses them on one press', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [CATALOGUE]: () => json(200, { items: [sahih] }),
          [searchFor(bukhari.nameAr)]: noAuthors,
          [searchFor(bukhari.nameEn)]: noAuthors,
          [searchFor('البخاري')]: () => json(200, { authors: { items: [yours], total: 1 } }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('Title in Arabic'), TYPED)
      await user.click(await screen.findByRole('button', { name: /صحيح البخاري/ }))
      await user.click(await screen.findByRole('button', { name: 'Use your author البخاري' }))

      expect(within(screen.getByRole('list', { name: 'Authors' })).getByText('البخاري')).toBeInTheDocument()
      expect(screen.queryByText(/Author in the catalogue/)).not.toBeInTheDocument()
    })

    it('adds the scholar as a new author with their death year, on one press', async () => {
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [CATALOGUE]: () => json(200, { items: [sahih] }),
          [searchFor(bukhari.nameAr)]: noAuthors,
          [searchFor(bukhari.nameEn)]: noAuthors,
          [searchFor('البخاري')]: noAuthors,
          '/api/v1/authors': () => json(201, { id: 'a10', nameAr: bukhari.nameAr, nameEn: bukhari.nameEn }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('Title in Arabic'), TYPED)
      await user.click(await screen.findByRole('button', { name: /صحيح البخاري/ }))
      await user.click(screen.getByRole('button', { name: 'Add Muhammad al-Bukhari as a new author' }))

      await waitFor(() =>
        expect(
          within(screen.getByRole('list', { name: 'Authors' })).getByText('Muhammad al-Bukhari'),
        ).toBeInTheDocument(),
      )
      expect(JSON.parse(String(callTo(api, '/api/v1/authors').body))).toEqual({
        nameAr: bukhari.nameAr,
        nameEn: bukhari.nameEn,
        death: { hijri: 256, ce: 870, approximate: false },
        // Linked to the scholar, so the general timeline shows them once (T2)
        wikidataId: bukhari.id,
      })
    })

    it('ignores an answer in the wrong shape', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [CATALOGUE]: () =>
            json(200, {
              items: [
                { id: 'not a QID', titleAr: 'x', authors: [bukhari] },
                { ...sahih, authors: [{ id: 'Q1' }] },
              ],
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('Title in Arabic'), TYPED)
      await new Promise((resolve) => setTimeout(resolve, 450))

      expect(screen.queryByRole('region', { name: "From the scholars' catalogue" })).not.toBeInTheDocument()
    })

    it('offers nothing on the edit page', async () => {
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/editions/e1': () => json(200, EDITION),
          '/api/v1/works/w1': () => json(200, { ...WORK, version: 2 }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/e1/edit')

      await user.clear(await screen.findByLabelText('Title in Arabic'))
      await user.type(screen.getByLabelText('Title in Arabic'), TYPED)
      await new Promise((resolve) => setTimeout(resolve, 450))

      expect(api.mock.calls.some(([path]) => String(path).startsWith('/api/v1/reference/works'))).toBe(false)
    })
  })

  describe('Saying what happened (from the first case study)', () => {
    const settings = () => json(200, { defaultCurrency: null })
    const ISBN = '9789933685027'

    it('puts the ISBN first, and says what it did: not in your library yet, what it filled in, and what next', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [`/api/v1/editions/by-isbn?isbn=${ISBN}`]: () => json(200, { items: [] }),
          [`/api/v1/editions/suggestions?isbn=${ISBN}`]: () =>
            json(200, {
              publisher: null,
              publicationPlace: null,
              language: { value: 'ar', from: 'country', country: 'SY' },
            }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      // The first field of the form
      const isbn = await screen.findByLabelText('ISBN')
      expect(screen.getAllByRole('textbox')[0]).toBe(isbn)
      await user.type(screen.getByLabelText('ISBN'), ISBN)

      expect(
        await screen.findByText(
          'Not in your library yet. Filled in from it: Language. Next, type the title below: classical works are offered as you type.',
        ),
      ).toBeInTheDocument()
      // Once a title is typed, the last part has done its job
      await user.type(screen.getByLabelText('Title in Arabic'), 'م')
      expect(await screen.findByText('Not in your library yet. Filled in from it: Language.')).toBeInTheDocument()
    })

    it("says when a title isn't in the catalogue, and the author field finds its author there", async () => {
      const TYPED = 'متممة الآجرومية'
      const hattab = { id: 'Q16120965', nameAr: 'الحطاب', nameEn: 'Al-Hattab', deathHijri: null, deathCe: 1547 }
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [`/api/v1/reference/works?q=${encodeURIComponent(TYPED)}&limit=5`]: () => json(200, { items: [] }),
          [`/api/v1/search?q=${encodeURIComponent('الحطاب')}&limit=8`]: () =>
            json(200, { authors: { items: [], total: 0 }, places: nothing, works: nothing, editions: nothing }),
          [`/api/v1/reference/scholars?q=${encodeURIComponent('الحطاب')}&limit=4`]: () =>
            json(200, { items: [hattab] }),
          '/api/v1/authors': () => json(201, { id: 'a5', nameAr: 'الحطاب', nameEn: 'Al-Hattab' }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')

      await user.type(await screen.findByLabelText('Title in Arabic'), TYPED)
      expect(
        await screen.findByText("Not in the scholars' catalogue. Type the title in full; its author may still be found below."),
      ).toBeInTheDocument()

      await user.type(screen.getByRole('combobox', { name: 'Authors' }), 'الحطاب')
      expect(await screen.findByText("From the scholars' catalogue, added with their death year")).toBeInTheDocument()
      await user.click(await screen.findByRole('option', { name: /^Al-Hattab \(d\. 1547 CE\)/ }))

      expect(within(await screen.findByRole('list', { name: 'Authors' })).getByText('Al-Hattab')).toBeInTheDocument()
      expect(JSON.parse(String(callTo(api, '/api/v1/authors').body))).toEqual({
        nameAr: 'الحطاب',
        nameEn: 'Al-Hattab',
        death: { hijri: null, ce: 1547, approximate: false },
        wikidataId: 'Q16120965',
      })
    })
  })

  describe('Photograph the cover or title page (ADR 0011)', () => {
    afterEach(() => {
      vi.restoreAllMocks() // the canvas, drawn on in jsdom for these tests only
    })
    const settings = () => json(200, { defaultCurrency: null })
    const STATUS = '/api/v1/page-readings/status'
    const on = (leftToday = 30) => () => json(200, { enabled: true, leftToday, leftThisMonth: 300, paused: false })
    const MUTAMMIMA = {
      fields: {
        title: 'متممة الآجرومية في علم العربية',
        authors: ['العلامة شمس الدين محمد بن محمد الرعيني المالكي الشهير بالحطاب'],
        authorDeathHijri: 954,
        muhaqqiq: 'مالك بن سالم بن مطر المهذري',
        publisher: 'دار ابن حزم',
        publicationPlace: 'بيروت',
        edition: 'الطبعة الأولى',
        publishedHijri: 1432,
        publishedCe: 2011,
        isbn: null,
      },
      lines: [
        'متممة الآجرومية في علم العربية',
        'تأليف',
        'العلامة شمس الدين محمد بن محمد الرعيني المالكي الشهير بالحطاب',
        '<img src=x onerror="window.hacked=1">',
        'طبعة مقابلة على نسخ خطية',
      ],
    }

    function photoCanBeDrawn() {
      vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 2000, close: () => {} })))
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D)
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
        callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
      )
    }

    function choosePhoto() {
      const input = document.querySelector('input[type=file]') as HTMLInputElement
      fireEvent.change(input, { target: { files: [new File(['photo'], 'cover.jpg', { type: 'image/jpeg' })] } })
    }

    it('fills the empty fields from the photo, each to confirm, and offers the author printed on it', async () => {
      photoCanBeDrawn()
      const api = fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [STATUS]: on(),
          '/api/v1/page-readings': () => json(200, MUTAMMIMA),
          [`/api/v1/search?q=${encodeURIComponent('الحطاب')}&limit=5`]: () =>
            json(200, { authors: { items: [], total: 0 } }),
          [`/api/v1/reference/scholars?q=${encodeURIComponent('الحطاب')}&limit=4`]: () =>
            json(200, { items: [{ id: 'Q16120965', nameAr: 'الحطاب', nameEn: 'Al-Hattab', deathHijri: null, deathCe: 1547 }] }),
          '/api/v1/authors': () => json(201, { id: 'a7', nameAr: 'الحطاب', nameEn: 'Al-Hattab' }),
        },
        'r@example.com',
      )
      renderPage('/books/new')

      // The first thing on the page, saying where the photo goes
      const take = await screen.findByRole('button', { name: 'Take or choose a photo' })
      expect(take).toHaveAccessibleDescription(/read by Google; only the picture is sent, without where or when/)
      choosePhoto()

      expect(await screen.findByText(/^Read\. The fields it filled say/)).toBeInTheDocument()
      const sent = callTo(api, '/api/v1/page-readings')
      expect((sent.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg')
      expect((sent.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
      // everyFieldReadFromThePageCarriesTheNote
      for (const [label, value] of [
        ['Title in Arabic', 'متممة الآجرومية في علم العربية'],
        ['Edited by (muḥaqqiq)', 'مالك بن سالم بن مطر المهذري'],
        ['Publisher', 'دار ابن حزم'],
        ['Place of publication', 'بيروت'],
        ['Year published (Hijri)', '1432'],
        ['Year published (CE)', '2011'],
        ['Edition', '1'],
      ]) {
        expect(screen.getByLabelText(label)).toHaveValue(value)
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(/Please confirm\. Read from the photo\./)
      }

      // aCatalogueScholarIsLinkedOnlyWhenChosen: offered, and nothing is added until a button is pressed
      expect(screen.getByText(/^Author on the page:/)).toBeInTheDocument()
      expect(api.mock.calls.map(([path]) => path)).not.toContain('/api/v1/authors')
      fireEvent.click(await screen.findByRole('button', { name: /^Use Al-Hattab \(d\. 1547 CE\) from the catalogue/ }))
      await waitFor(() => expect(within(screen.getByRole('list', { name: 'Authors' })).getByText('Al-Hattab')).toBeInTheDocument())
      // The page wins: its death year, linked to the scholar
      expect(JSON.parse(String(callTo(api, '/api/v1/authors').body))).toEqual({
        nameAr: 'الحطاب',
        nameEn: 'Al-Hattab',
        death: { hijri: 954, ce: null, approximate: false },
        wikidataId: 'Q16120965',
      })
    })

    it('lists every line, as text, and puts one in a field when chosen (scriptInALineIsShownAsText)', async () => {
      photoCanBeDrawn()
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [STATUS]: on(),
          '/api/v1/page-readings': () => json(200, { ...MUTAMMIMA, fields: { ...MUTAMMIMA.fields, authors: [] } }),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')
      await screen.findByRole('button', { name: 'Take or choose a photo' })
      choosePhoto()

      await user.click(await screen.findByText('5 lines read from the photo'))
      expect(screen.getByText('<img src=x onerror="window.hacked=1">')).toBeInTheDocument()
      expect((window as { hacked?: number }).hacked).toBeUndefined()

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Put “طبعة مقابلة على نسخ خطية” in a field' }),
        'Title on the cover',
      )
      expect(screen.getByLabelText('Title on the cover')).toHaveValue('طبعة مقابلة على نسخ خطية')
    })

    it('never replaces what you typed', async () => {
      photoCanBeDrawn()
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [STATUS]: on(),
          '/api/v1/page-readings': () => json(200, MUTAMMIMA),
        },
        'r@example.com',
      )
      const user = renderPage('/books/new')
      await user.type(await screen.findByLabelText('Publisher'), 'دار المنهاج')
      choosePhoto()

      await screen.findByText(/^Read\./)
      expect(screen.getByLabelText('Publisher')).toHaveValue('دار المنهاج')
      expect(screen.getByLabelText('Publisher')).not.toHaveAccessibleDescription(/Read from the photo/)
    })

    it('at a limit says so, and the form still works (atALimitTheFormStillWorks)', async () => {
      fakeApi({ [SCIENCES]: sciences, '/api/v1/library-settings': settings, [STATUS]: on(0) }, 'r@example.com')
      renderPage('/books/new')

      expect(await screen.findByRole('button', { name: 'Take or choose a photo' })).toBeDisabled()
      expect(screen.getByText(/You've used today's readings/)).toBeInTheDocument()
      expect(screen.getByLabelText('ISBN')).toBeEnabled()
      expect(screen.getByLabelText('Title in Arabic')).toBeEnabled()
    })

    it('says what went wrong, in words, when the page could not be read', async () => {
      photoCanBeDrawn()
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [STATUS]: on(),
          '/api/v1/page-readings': () => json(502, { status: 502, code: 'timed_out' }),
        },
        'r@example.com',
      )
      renderPage('/books/new')
      await screen.findByRole('button', { name: 'Take or choose a photo' })
      choosePhoto()

      expect(await screen.findByRole('alert')).toHaveTextContent('Reading the page took too long.')
    })

    it('is not offered when reading pages is not set up', async () => {
      fakeApi(
        {
          [SCIENCES]: sciences,
          '/api/v1/library-settings': settings,
          [STATUS]: () => json(200, { enabled: false, leftToday: 0, leftThisMonth: 0, paused: false }),
        },
        'r@example.com',
      )
      renderPage('/books/new')

      await screen.findByLabelText('ISBN')
      expect(screen.queryByRole('button', { name: 'Take or choose a photo' })).not.toBeInTheDocument()
      expect(screen.queryByText('Photograph the cover or title page')).not.toBeInTheDocument()
    })
  })
})
