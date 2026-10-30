import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { fakeApi, json } from '../test/fakeApi'
import type { TimelineAuthor } from '../timeline'
import AuthorTimelinePage from './AuthorTimelinePage'

const author = (id: string, nameEn: string, nameAr: string, hijri: number, more: Partial<TimelineAuthor> = {}) => ({
  id,
  nameAr,
  nameEn,
  deathHijri: hijri,
  deathCe: null,
  approximate: false,
  books: 1,
  works: 1,
  titles: [],
  science: null,
  ...more,
})

const TIMELINE = {
  authors: [
    author('a1', 'al-Bukhari', 'البخاري', 256, {
      books: 3,
      works: 4,
      titles: [
        { titleAr: 'الأدب المفرد', titleEn: 'al-Adab al-Mufrad' },
        { titleAr: 'صحيح البخاري', titleEn: 'Sahih al-Bukhari' },
      ],
      science: { id: 's1', nameAr: 'الحديث', nameEn: 'Hadith' },
    }),
    author('a2', 'al-Nawawi', 'النووي', 676),
    author('a3', 'Ibn Abd al-Barr', 'ابن عبد البر', 463),
    author('a4', 'al-Khatib al-Baghdadi', 'الخطيب البغدادي', 463),
  ],
  undated: [{ id: 'a9', nameAr: 'مؤلف معاصر', nameEn: null }],
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/authors/timeline']}>
      <AuthProvider>
        <Routes>
          <Route path="/authors/timeline" element={<AuthorTimelinePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('AuthorTimelinePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens on the author you have most books by, with their death, books and science', async () => {
    fakeApi({ '/api/v1/timeline': () => json(200, TIMELINE) }, 'r@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: '4 authors on the timeline' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute('aria-current', 'page')
    const ruler = screen.getByRole('slider', { name: 'Timeline of authors' })
    expect(ruler).toHaveAttribute('aria-valuenow', '256')
    expect(ruler).toHaveAttribute('aria-valuemax', '1448')
    const card = within(screen.getByRole('article'))
    expect(card.getByRole('heading', { name: 'al-Bukhari' })).toBeInTheDocument()
    expect(card.getByText(/^Died 256 AH/)).toBeInTheDocument()
    expect(card.getByText(/3rd century AH · 1192 years ago/)).toBeInTheDocument()
    expect(card.getByText('Hadith')).toBeInTheDocument()
    expect(card.getByText('3 books in your library')).toBeInTheDocument()
    expect(card.getByText(/al-Adab al-Mufrad, Sahih al-Bukhari/).closest('p')).toHaveTextContent('and 2 more')
  })

  it('steps through every author with the keys, naming those who died the same year', async () => {
    fakeApi({ '/api/v1/timeline': () => json(200, TIMELINE) }, 'r@example.com')
    renderPage()
    const ruler = await screen.findByRole('slider', { name: 'Timeline of authors' })

    fireEvent.keyDown(ruler, { key: 'ArrowRight' })
    expect(ruler).toHaveAttribute('aria-valuenow', '463')
    const card = within(screen.getByRole('article'))
    expect(card.getByText('Died the same year:')).toBeInTheDocument()
    fireEvent.keyDown(ruler, { key: 'ArrowRight' })
    expect(ruler).toHaveAttribute('aria-valuenow', '463')
    fireEvent.keyDown(ruler, { key: 'End' })
    expect(ruler).toHaveAttribute('aria-valuetext', expect.stringMatching(/^al-Nawawi, Died 676 AH/))
  })

  it('pins two authors and says the years between them, then clears', async () => {
    fakeApi({ '/api/v1/timeline': () => json(200, TIMELINE) }, 'r@example.com')
    const user = renderPage()
    const ruler = await screen.findByRole('slider', { name: 'Timeline of authors' })

    fireEvent.keyDown(ruler, { key: 'Enter' })
    expect(screen.getByText('al-Bukhari: 256 years after the Hijra, 1192 years ago')).toBeInTheDocument()
    fireEvent.keyDown(ruler, { key: 'End' })
    await user.click(screen.getByRole('button', { name: 'Compare with al-Bukhari' }))
    expect(screen.getByText('al-Bukhari and al-Nawawi: 420 years apart')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear comparison' }))
    expect(screen.queryByText(/years apart/)).not.toBeInTheDocument()
  })

  it('lists the authors without a date of death, so none is left out', async () => {
    fakeApi({ '/api/v1/timeline': () => json(200, TIMELINE) }, 'r@example.com')
    renderPage()

    expect(await screen.findByText('1 author without a date of death')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مؤلف معاصر' })).toHaveAttribute('href', '/authors/a9/edit')
  })

  it('in Arabic, reads right to left in Arabic numbers', async () => {
    await i18n.changeLanguage('ar')
    fakeApi({ '/api/v1/timeline': () => json(200, TIMELINE) }, 'r@example.com')
    renderPage()

    const card = within(await screen.findByRole('article'))
    expect(card.getByRole('heading', { name: 'البخاري' })).toBeInTheDocument()
    expect(card.getByText(/القرن الثالث الهجري · قبل ١١٩٢ سنة/)).toBeInTheDocument()
    const ruler = screen.getByRole('slider', { name: 'الخط الزمني للمؤلفين' })
    // Forward in time is to the left in Arabic
    fireEvent.keyDown(ruler, { key: 'ArrowLeft' })
    expect(ruler).toHaveAttribute('aria-valuenow', '463')
  })

  it('says how to fill the timeline when no author has a date of death', async () => {
    fakeApi({ '/api/v1/timeline': () => json(200, { authors: [], undated: [] }) }, 'r@example.com')
    renderPage()
    expect(await screen.findByText('Add the year an author died, and they will appear here.')).toBeInTheDocument()
  })
})
