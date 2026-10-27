import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import PlacesPage from './PlacesPage'

const MAKKAH = {
  id: 'p1',
  nameAr: 'مكة',
  nameEn: 'Makkah',
  countryAr: 'السعودية',
  countryEn: 'Saudi Arabia',
  shared: true,
}
const BUKHARA = {
  id: 'p2',
  nameAr: 'بخارى',
  nameEn: 'Bukhara',
  countryAr: null,
  countryEn: 'Uzbekistan',
  shared: false,
}
const list = (scope: string, page = 0, sort = 'en') => `/api/v1/places?page=${page}&size=50&sort=${sort}&scope=${scope}`

function renderPage(path = '/places') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/places" element={<PlacesPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('PlacesPage', () => {
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

  it('lists your places and the shared ones as an index, with their countries', async () => {
    fakeApi(
      { [list('all')]: () => json(200, { items: [BUKHARA, MAKKAH], page: 0, size: 50, total: 2 }) },
      'r@example.com',
    )
    renderPage()

    expect(await screen.findByText('2 places')).toBeInTheDocument()
    expect(screen.getByText('Bukhara').closest('a')).toHaveAttribute('href', '/places/p2')
    expect(screen.getByText('Saudi Arabia')).toBeInTheDocument()
    expect(screen.getByText('M')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('link', { name: 'Add a place' })).toHaveAttribute('href', '/places/new')
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows only your own places, and says so when there are none', async () => {
    const api = fakeApi(
      {
        [list('all')]: () => json(200, { items: [MAKKAH], page: 0, size: 50, total: 1 }),
        [list('mine')]: () => json(200, { items: [], page: 0, size: 50, total: 0 }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('link', { name: 'Added by you' }))

    expect(await screen.findByText(/You haven't added any places yet/)).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === list('mine'))).toBe(true)
  })

  it('sorts by the Arabic name on the Arabic page', async () => {
    await i18n.changeLanguage('ar')
    const api = fakeApi(
      { [list('all', 0, 'ar')]: () => json(200, { items: [MAKKAH], page: 0, size: 50, total: 1 }) },
      'r@example.com',
    )
    renderPage()

    expect(await screen.findByText('مكان واحد')).toBeInTheDocument()
    expect(screen.getByText('السعودية')).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === list('all', 0, 'ar'))).toBe(true)
  })

  it('says so when the list could not be loaded', async () => {
    fakeApi({ [list('all')]: () => json(500) }, 'r@example.com')
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this")
  })
})
