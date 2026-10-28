import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { BENEFIT, EDITION, WORK } from '../test/books'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BenefitFormPage from './BenefitFormPage'

function Shown({ what }: { what: string }) {
  const location = useLocation()
  return (
    <>
      <h1>{what}</h1>
      <p>{(location.state as { notice?: string } | null)?.notice}</p>
    </>
  )
}

function renderPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/benefits/new" element={<BenefitFormPage mode="add" />} />
          <Route path="/benefits/:id/edit" element={<BenefitFormPage mode="edit" />} />
          <Route path="/benefits/:id" element={<Shown what="Benefit page" />} />
          <Route path="/books/:id" element={<Shown what="Book page" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BenefitFormPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a benefit from the book it was started from, with a volume and page, then goes back to the book', async () => {
    const api = fakeApi(
      { '/api/v1/editions/e1': () => json(200, EDITION), '/api/v1/benefits': () => json(201, BENEFIT) },
      'r@example.com',
    )
    const user = renderPage('/benefits/new?book=e1')

    expect(await screen.findByRole('button', { name: 'Remove Sahih al-Bukhari' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('The benefit'), 'إنما الأعمال بالنيات.')
    await user.type(screen.getByLabelText('Volume'), '١')
    await user.type(screen.getByLabelText('Page'), '6')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Book page' })).toBeInTheDocument()
    expect(screen.getByText('Benefit saved.')).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/benefits').body as string)).toEqual({
      text: 'إنما الأعمال بالنيات.',
      editionId: 'e1',
      volume: 1,
      page: 6,
    })
  })

  it('saves a benefit with no book, and checks the text first', async () => {
    const api = fakeApi(
      { '/api/v1/benefits': () => json(201, { ...BENEFIT, edition: null, volume: null, page: null }) },
      'r@example.com',
    )
    const user = renderPage('/benefits/new')

    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('The benefit'), 'Seek knowledge.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Benefit page' })).toBeInTheDocument()
    expect(JSON.parse(callTo(api, '/api/v1/benefits').body as string)).toEqual({
      text: 'Seek knowledge.',
      editionId: null,
      volume: null,
      page: null,
    })
  })

  it('finds the book as you type', async () => {
    fakeApi(
      {
        '/api/v1/search?q=Sahih&limit=8': () =>
          json(200, {
            authors: { items: [], total: 0 },
            places: { items: [], total: 0 },
            works: { items: [], total: 0 },
            benefits: { items: [], total: 0 },
            editions: { items: [{ id: 'e1', title: null, volumes: 1, work: WORK }], total: 1 },
          }),
      },
      'r@example.com',
    )
    const user = renderPage('/benefits/new')

    await user.type(await screen.findByRole('combobox', { name: 'Book' }), 'Sahih')
    await user.click(await screen.findByRole('option', { name: /Sahih al-Bukhari/ }))
    expect(screen.getByRole('button', { name: 'Remove Sahih al-Bukhari' })).toBeInTheDocument()
    // A single volume: only the page is asked for
    expect(screen.queryByLabelText('Volume')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Page')).toBeInTheDocument()
  })

  it('edits a benefit, sending back the version it started from', async () => {
    const api = fakeApi(
      { '/api/v1/benefits/b1': (init) => (init.method === 'PUT' ? json(200, BENEFIT) : json(200, BENEFIT)) },
      'r@example.com',
    )
    const user = renderPage('/benefits/b1/edit')

    expect(await screen.findByLabelText('The benefit')).toHaveValue(BENEFIT.text)
    expect(screen.getByLabelText('Page')).toHaveValue('6')
    await user.clear(screen.getByLabelText('Page'))
    await user.type(screen.getByLabelText('Page'), '7')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')![1] as RequestInit
    expect((put.headers as Record<string, string>)['If-Match']).toBe('"2"')
    expect(JSON.parse(put.body as string)).toMatchObject({ editionId: 'e1', volume: 1, page: 7 })
  })
})
