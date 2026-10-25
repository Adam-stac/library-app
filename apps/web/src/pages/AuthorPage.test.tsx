import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import AuthorPage from './AuthorPage'

const AUTHOR = {
  id: 'a1',
  nameAr: 'البخاري',
  nameEn: 'al-Bukhari',
  fullName: 'محمد بن إسماعيل البخاري',
  ism: null,
  kunya: 'أبو عبد الله',
  laqab: null,
  nisba: null,
  birth: { hijri: 194, ce: null, approximate: false },
  death: { hijri: 256, ce: 870, approximate: false },
  birthPlace: null,
  deathPlace: null,
  biography: '<script>alert(1)</script>\n<img src=x onerror=alert(2)>',
  version: 0,
  createdAt: '2026-10-25T10:00:00Z',
  updatedAt: '2026-10-25T10:00:00Z',
}

function ListPlaceholder() {
  const location = useLocation()
  return (
    <>
      <h1>Authors list</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage(path = '/authors/a1') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/authors" element={<ListPlaceholder />} />
          <Route path="/authors/:id" element={<AuthorPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('AuthorPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await i18n.changeLanguage('en')
  })

  it('shows the names, years and biography', async () => {
    fakeApi({ '/api/v1/authors/a1': () => json(200, AUTHOR) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'al-Bukhari', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('البخاري')).toBeInTheDocument()
    expect(screen.getByText('194 AH (809–810 CE)')).toBeInTheDocument()
    expect(screen.getByText('256 AH (870 CE)')).toBeInTheDocument()
    expect(screen.getByText('محمد بن إسماعيل البخاري')).toBeInTheDocument()
    expect(screen.getByText('أبو عبد الله')).toBeInTheDocument()
    expect(screen.getByText('CE years in brackets are worked out from the Hijri year.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/authors/a1/edit')
  })

  it('shows markup in a biography as text, never running it', async () => {
    fakeApi({ '/api/v1/authors/a1': () => json(200, AUTHOR) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
    expect(screen.getByText(/<img src=x onerror=alert\(2\)>/)).toBeInTheDocument()
    expect(document.querySelector('main script, section script, img')).toBeNull()
  })

  it('shows the Arabic name first on the Arabic page', async () => {
    await i18n.changeLanguage('ar')
    fakeApi({ '/api/v1/authors/a1': () => json(200, AUTHOR) }, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'البخاري', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('٢٥٦هـ (٨٧٠م)')).toBeInTheDocument()
  })

  it('says so when the author is not in your library', async () => {
    fakeApi({ '/api/v1/authors/zz': () => json(404, { status: 404, code: 'not_found' }) }, 'reader@example.com')
    renderPage('/authors/zz')

    expect(await screen.findByRole('alert')).toHaveTextContent("This author isn't in your library")
  })

  it('deletes the author after you confirm', async () => {
    const api = fakeApi(
      { '/api/v1/authors/a1': (init) => (init.method === 'DELETE' ? json(204) : json(200, AUTHOR)) },
      'reader@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText("Delete al-Bukhari? This can't be undone.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { name: 'Authors list' })).toBeInTheDocument()
    expect(screen.getByText('al-Bukhari was deleted.')).toBeInTheDocument()
    const deletion = api.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(deletion).toBeDefined()
    const [path, init] = deletion!
    expect(path).toBe('/api/v1/authors/a1')
    expect(((init as RequestInit).headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
  })
})
