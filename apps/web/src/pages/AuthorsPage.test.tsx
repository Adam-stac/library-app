import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import AuthorsPage from './AuthorsPage'

const year = (hijri: number | null) => ({ hijri, ce: null, approximate: false })
const BUKHARI = { id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhari', birth: year(194), death: year(256) }
const TABARI = { id: 'a2', nameAr: 'الطبري', nameEn: null, birth: year(null), death: year(310) }
const list = (language: string, page = 0) => `/api/v1/authors?page=${page}&size=50&sort=${language}`

function renderPage(path = '/authors') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/authors" element={<AuthorsPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('AuthorsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await i18n.changeLanguage('en')
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('lists your authors with their names and years', async () => {
    fakeApi(
      { [list('en')]: () => json(200, { items: [BUKHARI, TABARI], page: 0, size: 50, total: 2 }) },
      'reader@example.com',
    )
    renderPage()

    expect(await screen.findByText('2 authors')).toBeInTheDocument()
    expect(screen.getByText('al-Bukhari').closest('a')).toHaveAttribute('href', '/authors/a1')
    expect(screen.getByText('البخاري')).toBeInTheDocument()
    expect(screen.getByText('194 AH (809–810 CE) – 256 AH (869–870 CE)')).toBeInTheDocument()
    // Only an Arabic name: it is shown even on the English page
    expect(screen.getByText('الطبري').closest('a')).toHaveAttribute('href', '/authors/a2')
    expect(screen.getByText('Died 310 AH (922–923 CE)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an author' })).toHaveAttribute('href', '/authors/new')
  })

  it('sorts by the Arabic name and counts in Arabic on the Arabic page', async () => {
    await i18n.changeLanguage('ar')
    const api = fakeApi(
      { [list('ar')]: () => json(200, { items: [BUKHARI, TABARI], page: 0, size: 50, total: 2 }) },
      'reader@example.com',
    )
    renderPage()

    expect(await screen.findByText('مؤلفان')).toBeInTheDocument()
    expect(screen.getByText('١٩٤هـ (٨٠٩–٨١٠م) – ٢٥٦هـ (٨٦٩–٨٧٠م)')).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === list('ar'))).toBe(true)
  })

  it('says when there are no authors yet', async () => {
    fakeApi({ [list('en')]: () => json(200, { items: [], page: 0, size: 50, total: 0 }) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByText("You haven't added any authors yet.")).toBeInTheDocument()
  })

  it('moves between pages', async () => {
    const page = (n: number) => () =>
      json(200, { items: [{ ...BUKHARI, id: `p${n}`, nameEn: `Author on page ${n + 1}` }], page: n, size: 50, total: 120 })
    fakeApi({ [list('en', 0)]: page(0), [list('en', 1)]: page(1) }, 'reader@example.com')
    const user = renderPage()

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(await screen.findByText('Author on page 2')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/authors?page=1')
  })
})
