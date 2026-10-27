import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import PlacePage from './PlacePage'

const PLACE = {
  id: 'p2',
  nameAr: 'بخارى',
  nameEn: 'Bukhara',
  otherNames: ['Buxoro'],
  countryAr: 'أوزبكستان',
  countryEn: 'Uzbekistan',
  latitude: 39.77472,
  longitude: 64.42861,
  shared: false,
  version: 2,
  createdAt: '2026-10-25T10:00:00Z',
  updatedAt: '2026-10-25T10:00:00Z',
}

function PlacesList() {
  const location = useLocation()
  return (
    <>
      <h1>Places list</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/places/p2']}>
      <AuthProvider>
        <Routes>
          <Route path="/places" element={<PlacesList />} />
          <Route path="/places/:id" element={<PlacePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('PlacePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the names, country and position, with a map link that opens safely', async () => {
    fakeApi({ '/api/v1/places/p2': () => json(200, PLACE) }, 'r@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Bukhara', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('بخارى')).toBeInTheDocument()
    expect(screen.getByText('Buxoro')).toBeInTheDocument()
    expect(screen.getByText('أوزبكستان · Uzbekistan')).toBeInTheDocument()
    const map = screen.getByText('39.77472°').closest('a')!
    expect(map).toHaveTextContent('39.77472° N, 64.42861° E')
    expect(map).toHaveAttribute('href', expect.stringMatching(/^https:\/\/www\.openstreetmap\.org\//))
    expect(map).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/places/p2/edit')
  })

  it('offers no edit or delete for a place on the shared list', async () => {
    fakeApi({ '/api/v1/places/p2': () => json(200, { ...PLACE, shared: true }) }, 'r@example.com')
    renderPage()

    expect(await screen.findByText(/on the shared list everyone starts with/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('deletes the place after you confirm', async () => {
    fakeApi(
      { '/api/v1/places/p2': (init) => (init.method === 'DELETE' ? json(204) : json(200, PLACE)) },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { name: 'Places list' })).toBeInTheDocument()
    expect(screen.getByText('Bukhara was deleted.')).toBeInTheDocument()
  })

  it('says which records still use the place when it cannot be deleted', async () => {
    fakeApi(
      {
        '/api/v1/places/p2': (init) =>
          init.method === 'DELETE' ? json(409, { code: 'in_use', usedBy: { authors: 2 } }) : json(200, PLACE),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This is still used by 2 authors')
    expect(screen.getByRole('heading', { name: 'Bukhara', level: 1 })).toBeInTheDocument()
  })

  it('says so when the place is not in your library', async () => {
    fakeApi({ '/api/v1/places/p2': () => json(404, { code: 'not_found' }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("This place isn't in your library")
  })
})
