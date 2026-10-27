import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { BENEFIT, EDITION } from '../test/books'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import BenefitsPage from './BenefitsPage'

const LIST = '/api/v1/benefits?page=0&size=20'

function renderPage(path = '/benefits') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/benefits" element={<BenefitsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BenefitsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the benefits, newest first, with the book, volume and page each came from', async () => {
    const fromHasib = {
      ...BENEFIT,
      id: 'b2',
      text: 'Seek knowledge.',
      edition: null,
      volume: null,
      page: null,
      source: 'hasib',
    }
    fakeApi({ [LIST]: () => json(200, { items: [fromHasib, BENEFIT], page: 0, size: 20, total: 2 }) }, 'r@example.com')
    renderPage()

    expect(await screen.findByText('2 benefits')).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('article')
    expect(within(first).getByText('From Ḥāsib')).toBeInTheDocument()
    expect(within(second).getByText(/إنما الأعمال بالنيات/)).toBeInTheDocument()
    expect(within(second).getByRole('link', { name: 'Sahih al-Bukhari' })).toHaveAttribute('href', '/books/e1')
    expect(within(second).getByText('Volume 1, page 6')).toBeInTheDocument()
    expect(within(second).getByRole('link', { name: 'Edit the benefit of 20 October 2026' })).toHaveAttribute(
      'href',
      '/benefits/b1/edit',
    )
  })

  it('shows the benefits from one book, and deletes one after you confirm', async () => {
    let deleted = false
    fakeApi(
      {
        [`${LIST}&editionId=e1`]: () =>
          json(
            200,
            deleted ? { items: [], page: 0, size: 20, total: 0 } : { items: [BENEFIT], page: 0, size: 20, total: 1 },
          ),
        '/api/v1/editions/e1': () => json(200, EDITION),
        '/api/v1/benefits/b1': () => {
          deleted = true
          return json(204)
        },
      },
      'r@example.com',
    )
    const user = renderPage('/benefits?book=e1')

    expect(await screen.findByText('1 benefit')).toBeInTheDocument()
    expect(screen.getByText(/^From/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a benefit' })).toHaveAttribute('href', '/benefits/new?book=e1')
    await user.click(screen.getByRole('button', { name: 'Delete the benefit of 20 October 2026' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText('Benefit deleted.')).toBeInTheDocument()
    expect(await screen.findByText('No benefits from this book yet.')).toBeInTheDocument()
  })

  it('says when there are none yet', async () => {
    fakeApi({ [LIST]: () => json(200, { items: [], page: 0, size: 20, total: 0 }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByText("You haven't saved any benefits yet.")).toBeInTheDocument()
  })
})
