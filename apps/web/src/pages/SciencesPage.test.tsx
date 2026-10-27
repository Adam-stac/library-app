import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import SciencesPage from './SciencesPage'

const HADITH = { id: 's1', nameAr: 'الحديث', nameEn: 'Ḥadīth', version: 0 }
const FIQH = { id: 's2', nameAr: 'الفقه', nameEn: 'Fiqh', version: 1 }
const LIST = '/api/v1/sciences?sort=en'

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <SciencesPage />
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SciencesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists your sciences with both names', async () => {
    fakeApi({ [LIST]: () => json(200, { items: [FIQH, HADITH], total: 2 }) }, 'r@example.com')
    renderPage()

    expect(await screen.findByText('2 sciences')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Fiqh')
    expect(items[0]).toHaveTextContent('الفقه')
    expect(items[1]).toHaveTextContent('الحديث')
  })

  it('adds a science and shows the list again', async () => {
    let added = false
    const api = fakeApi(
      {
        [LIST]: () => json(200, added ? { items: [FIQH, HADITH], total: 2 } : { items: [FIQH], total: 1 }),
        '/api/v1/sciences': () => {
          added = true
          return json(201, HADITH)
        },
      },
      'r@example.com',
    )
    const user = renderPage()

    const form = within(await screen.findByRole('form', { name: 'Add a science' }))
    await user.type(form.getByLabelText('Name in Arabic'), 'الحديث')
    await user.click(form.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Ḥadīth was added.')).toBeInTheDocument()
    expect(await screen.findByText('2 sciences')).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/sciences').body as string)).toEqual({ nameAr: 'الحديث', nameEn: null })
    expect(form.getByLabelText('Name in Arabic')).toHaveValue('')
  })

  it('says when you already have a science with that name', async () => {
    fakeApi(
      {
        [LIST]: () => json(200, { items: [FIQH], total: 1 }),
        '/api/v1/sciences': () => json(400, { errors: [{ field: 'nameEn', code: 'already_used' }] }),
      },
      'r@example.com',
    )
    const user = renderPage()

    const form = within(await screen.findByRole('form', { name: 'Add a science' }))
    await user.type(form.getByLabelText('Name in English'), 'fiqh')
    await user.click(form.getByRole('button', { name: 'Add' }))

    expect(await form.findByText('You already have one with this name.')).toBeInTheDocument()
  })

  it('renames a science, sending back its version', async () => {
    const api = fakeApi(
      {
        [LIST]: () => json(200, { items: [FIQH], total: 1 }),
        '/api/v1/sciences/s2': () => json(200, { ...FIQH, nameEn: 'Islamic law', version: 2 }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Rename Fiqh' }))
    const form = within(screen.getByRole('form', { name: 'Rename Fiqh' }))
    await user.clear(form.getByLabelText('Name in English'))
    await user.type(form.getByLabelText('Name in English'), 'Islamic law')
    await user.click(form.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    const put = callTo(api, '/api/v1/sciences/s2')
    expect(put.method).toBe('PUT')
    expect((put.headers as Record<string, string>)['If-Match']).toBe('"1"')
  })

  it('explains that a science used by books cannot be deleted', async () => {
    fakeApi(
      {
        [LIST]: () => json(200, { items: [FIQH], total: 1 }),
        '/api/v1/sciences/s2': () => json(409, { code: 'in_use', usedBy: { works: 3 } }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Delete Fiqh' }))
    expect(screen.getByText("Delete Fiqh? This can't be undone.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This is still used by 3 books')
  })
})
