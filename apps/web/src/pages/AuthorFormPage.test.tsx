import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import AuthorFormPage from './AuthorFormPage'

const AUTHOR = {
  id: 'a1',
  nameAr: 'البخاري',
  nameEn: 'al-Bukhari',
  fullName: null,
  ism: null,
  kunya: 'أبو عبد الله',
  laqab: null,
  nisba: null,
  birth: { hijri: 194, ce: null, approximate: false },
  death: { hijri: 256, ce: 870, approximate: false },
  birthPlace: { id: 'p1', nameAr: 'بخارى', nameEn: 'Bukhara' },
  deathPlace: null,
  biography: 'صاحب الصحيح.',
  version: 3,
  createdAt: '2026-10-25T10:00:00Z',
  updatedAt: '2026-10-25T10:00:00Z',
}

function AuthorPlaceholder() {
  const location = useLocation()
  return (
    <>
      <h1>Author page</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/authors/new" element={<AuthorFormPage mode="add" />} />
          <Route path="/authors/:id/edit" element={<AuthorFormPage mode="edit" />} />
          <Route path="/authors/:id" element={<AuthorPlaceholder />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const fieldset = (name: string) => within(screen.getByRole('group', { name }))

describe('AuthorFormPage', () => {
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
    renderPage('/authors/new')

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('adds an author, reading Arabic-Indic digits and years before the Hijra', async () => {
    const api = fakeApi(
      { '/api/v1/authors': () => json(201, { ...AUTHOR, id: 'new1', version: 0 }) },
      'reader@example.com',
    )
    const user = renderPage('/authors/new')

    await user.type(await screen.findByLabelText('Name in Arabic'), 'أبو بكر الصديق')
    const birth = fieldset('Birth')
    await user.type(birth.getByLabelText('Hijri year of birth'), '٥١')
    await user.selectOptions(birth.getByLabelText('Birth year: AH or BH'), 'BH')
    await user.click(birth.getByLabelText('The year of birth is approximate'))
    expect(birth.getByText('Shown as: c. 51 BH (573–574 CE)')).toBeInTheDocument()
    await user.type(fieldset('Death').getByLabelText('Hijri year of death'), '13')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Author page' })).toBeInTheDocument()
    expect(screen.getByText('Author added.')).toBeInTheDocument()
    const request = callTo(api, '/api/v1/authors')
    expect(request.method).toBe('POST')
    expect((request.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-123')
    expect(JSON.parse(request.body as string)).toEqual({
      nameAr: 'أبو بكر الصديق',
      nameEn: null,
      fullName: null,
      ism: null,
      kunya: null,
      laqab: null,
      nisba: null,
      birth: { hijri: -51, ce: null, approximate: true },
      death: { hijri: 13, ce: null, approximate: false },
      birthPlaceId: null,
      deathPlaceId: null,
      biography: null,
    })
  })

  it('needs a name and a sensible year before sending anything', async () => {
    const api = fakeApi({}, 'reader@example.com')
    const user = renderPage('/authors/new')

    await user.type(await screen.findByLabelText('Hijri year of birth'), '25a')
    await user.type(screen.getByLabelText('CE year of death'), '2200')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Fill in the name in Arabic or in English.')).toBeInTheDocument()
    expect(screen.getByLabelText('Hijri year of birth')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('CE year of death')).toHaveAttribute('aria-invalid', 'true')
    expect(api.mock.calls.some(([path]) => path === '/api/v1/authors')).toBe(false)
  })

  it("shows the API's errors next to the right fields", async () => {
    fakeApi(
      {
        '/api/v1/authors': () =>
          json(400, { status: 400, errors: [{ field: 'death.hijri', code: 'before_birth' }] }),
      },
      'reader@example.com',
    )
    const user = renderPage('/authors/new')

    await user.type(await screen.findByLabelText('Name in English'), 'Someone')
    await user.type(screen.getByLabelText('Hijri year of birth'), '256')
    await user.type(screen.getByLabelText('Hijri year of death'), '194')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("The year of death can't be before the year of birth.")).toBeInTheDocument()
    expect(screen.getByLabelText('Hijri year of death')).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits an author, sending back the version it started from and keeping its places', async () => {
    const api = fakeApi(
      {
        '/api/v1/authors/a1': (init) =>
          init.method === 'PUT' ? json(200, { ...AUTHOR, nameEn: 'Imam al-Bukhari', version: 4 }) : json(200, AUTHOR),
      },
      'reader@example.com',
    )
    const user = renderPage('/authors/a1/edit')

    const english = await screen.findByLabelText('Name in English')
    expect(screen.getByRole('heading', { name: 'Edit al-Bukhari' })).toBeInTheDocument()
    expect(english).toHaveValue('al-Bukhari')
    expect(screen.getByLabelText('Kunya')).toHaveValue('أبو عبد الله')
    expect(screen.getByLabelText('CE year of death')).toHaveValue('870')
    await user.clear(english)
    await user.type(english, 'Imam al-Bukhari')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    const put = api.mock.calls.find(([path, init]) => path === '/api/v1/authors/a1' && init?.method === 'PUT')
    expect(put).toBeDefined()
    const init = put![1] as RequestInit
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"3"')
    expect(JSON.parse(init.body as string)).toMatchObject({
      nameEn: 'Imam al-Bukhari',
      kunya: 'أبو عبد الله',
      birth: { hijri: 194, ce: null, approximate: false },
      death: { hijri: 256, ce: 870, approximate: false },
      birthPlaceId: 'p1',
      deathPlaceId: null,
      biography: 'صاحب الصحيح.',
    })
  })

  it('explains when the author was changed on another device, and loads the latest version', async () => {
    let reads = 0
    fakeApi(
      {
        '/api/v1/authors/a1': (init) => {
          if (init.method === 'PUT') return json(409, { status: 409, code: 'stale_version' })
          reads++
          return json(200, reads === 1 ? AUTHOR : { ...AUTHOR, nameEn: 'Changed on the phone', version: 4 })
        },
      },
      'reader@example.com',
    )
    const user = renderPage('/authors/a1/edit')

    await user.type(await screen.findByLabelText('Name in English'), ' (edited)')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('changed on another device')
    await user.click(screen.getByRole('button', { name: 'Load the latest version' }))
    expect(await screen.findByDisplayValue('Changed on the phone')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says so when the author to edit is not in your library', async () => {
    fakeApi({ '/api/v1/authors/zz': () => json(404, { status: 404, code: 'not_found' }) }, 'reader@example.com')
    renderPage('/authors/zz/edit')

    expect(await screen.findByRole('alert')).toHaveTextContent("This author isn't in your library")
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
