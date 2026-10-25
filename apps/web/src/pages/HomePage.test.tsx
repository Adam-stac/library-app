import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import HomePage from './HomePage'

const year = (hijri: number | null) => ({ hijri, ce: null, approximate: false })
const BUKHARI = { id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhari', birth: year(194), death: year(256) }
const FIRST_FIVE = '/api/v1/authors?page=0&size=5&sort=en'

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

  it('signed in: the first authors, and the way to all of them', async () => {
    fakeApi({ [FIRST_FIVE]: () => json(200, { items: [BUKHARI], page: 0, size: 5, total: 9 }) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByText('al-Bukhari')).toBeInTheDocument()
    expect(screen.getByText('al-Bukhari').closest('a')).toHaveAttribute('href', '/authors/a1')
    expect(screen.getByText('d. 256 AH')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all 9' })).toHaveAttribute('href', '/authors')
  })

  it('signed in with no authors yet: the way to add the first', async () => {
    fakeApi({ [FIRST_FIVE]: () => json(200, { items: [], page: 0, size: 5, total: 0 }) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByText("Add the authors of your books and they'll be listed here.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an author' })).toHaveAttribute('href', '/authors/new')
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('says so when the authors could not be loaded', async () => {
    fakeApi({ [FIRST_FIVE]: () => json(500) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this")
  })
})
