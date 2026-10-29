import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import PlaceFormPage from './PlaceFormPage'

const PLACE = {
  id: 'p2',
  nameAr: 'بخارى',
  nameEn: 'Bukhara',
  otherNames: ['Buxoro'],
  countryAr: null,
  countryEn: 'Uzbekistan',
  latitude: 39.77472,
  longitude: 64.42861,
  shared: false,
  version: 2,
}

function PlaceShown() {
  const location = useLocation()
  return (
    <>
      <h1>Place page</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/places/new" element={<PlaceFormPage mode="add" />} />
          <Route path="/places/:id/edit" element={<PlaceFormPage mode="edit" />} />
          <Route path="/places/:id" element={<PlaceShown />} />
          <Route path="/places" element={<h1>Places list</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('PlaceFormPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds a place, with other names one per line and a position in Arabic-Indic digits', async () => {
    const api = fakeApi({ '/api/v1/places': () => json(201, { ...PLACE, id: 'p9' }) }, 'r@example.com')
    const user = renderPage('/places/new')

    await user.type(await screen.findByLabelText('Name in Arabic'), 'القسطنطينية')
    await user.type(screen.getByLabelText('Name in English'), 'Constantinople')
    await user.type(screen.getByLabelText('Other names'), 'إسطنبول{Enter}  {Enter}Istanbul')
    await user.type(screen.getByLabelText('Latitude'), '٤١٫٠٠٨٢')
    await user.type(screen.getByLabelText('Longitude'), '28.9784')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Place added.')).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/places').body as string)).toEqual({
      nameAr: 'القسطنطينية',
      nameEn: 'Constantinople',
      otherNames: ['إسطنبول', 'Istanbul'],
      countryAr: null,
      countryEn: null,
      latitude: 41.0082,
      longitude: 28.9784,
    })
  })

  it('checks the name and the position before sending anything', async () => {
    const api = fakeApi({}, 'r@example.com')
    const user = renderPage('/places/new')

    await user.type(await screen.findByLabelText('Latitude'), '95')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Fill in the name in Arabic or in English.')).toBeInTheDocument()
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-invalid', 'true')
    await user.clear(screen.getByLabelText('Latitude'))
    await user.type(screen.getByLabelText('Latitude'), '21.4')
    await user.type(screen.getByLabelText('Name in English'), 'Makkah')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Fill in both the latitude and the longitude, or neither.')).toBeInTheDocument()
    expect(api.mock.calls.some(([path]) => path === '/api/v1/places')).toBe(false)
  })

  it('edits a place, sending back the version it started from', async () => {
    const api = fakeApi(
      {
        '/api/v1/places/p2': (init) =>
          init.method === 'PUT' ? json(200, { ...PLACE, countryAr: 'أوزبكستان', version: 3 }) : json(200, PLACE),
      },
      'r@example.com',
    )
    const user = renderPage('/places/p2/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Bukhara' })).toBeInTheDocument()
    expect(screen.getByLabelText('Other names')).toHaveValue('Buxoro')
    await user.type(screen.getByLabelText('Country in Arabic'), 'أوزبكستان')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')![1] as RequestInit
    expect((put.headers as Record<string, string>)['If-Match']).toBe('"2"')
    expect(JSON.parse(put.body as string)).toMatchObject({ countryAr: 'أوزبكستان', latitude: 39.77472 })
  })

  it('explains a change made on another device, and loads the latest version', async () => {
    let reads = 0
    fakeApi(
      {
        '/api/v1/places/p2': (init) => {
          if (init.method === 'PUT') return json(409, { code: 'stale_version' })
          reads++
          return json(200, reads === 1 ? PLACE : { ...PLACE, nameEn: 'Bukhoro', version: 5 })
        },
      },
      'r@example.com',
    )
    const user = renderPage('/places/p2/edit')

    await user.type(await screen.findByLabelText('Country in Arabic'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/changed on another device/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load the latest version' }))

    expect(await screen.findByDisplayValue('Bukhoro')).toBeInTheDocument()
    expect(screen.getByLabelText('Country in Arabic')).toHaveValue('')
    expect(screen.queryByText(/changed on another device/)).not.toBeInTheDocument()
  })

  it('refuses to edit a place on the shared list', async () => {
    fakeApi({ '/api/v1/places/p2': () => json(200, { ...PLACE, shared: true }) }, 'r@example.com')
    renderPage('/places/p2/edit')
    expect(await screen.findByRole('alert')).toHaveTextContent("This is on the shared list, so it can't be changed.")
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('checks a field as soon as you leave it, and clears the problem once it is put right', async () => {
    fakeApi({}, 'r@example.com')
    const user = renderPage('/places/new')

    // Passing through an empty field says nothing
    await user.click(await screen.findByLabelText('Name in Arabic'))
    await user.tab()
    expect(screen.queryByText(/Fill in the name/)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Latitude'), '100')
    await user.tab()
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/latitude is from -90 to 90/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Latitude'))
    await user.type(screen.getByLabelText('Latitude'), '21.4225')
    await user.tab()
    expect(screen.getByLabelText('Latitude')).not.toHaveAttribute('aria-invalid')
  })

  it('asks before leaving with changes not saved, and stays by default', async () => {
    fakeApi({}, 'r@example.com')
    const user = renderPage('/places/new')

    await user.type(await screen.findByLabelText('Name in English'), 'Kufa')
    await user.click(screen.getByRole('link', { name: 'All places' }))

    expect(screen.getByRole('heading', { name: 'Leave without saving?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Name in English')).toHaveValue('Kufa')

    await user.click(screen.getByRole('link', { name: 'All places' }))
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(await screen.findByRole('heading', { name: 'Places list' })).toBeInTheDocument()
  })
})
