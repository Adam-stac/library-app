import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import AboutDataPage from './AboutDataPage'

describe('AboutDataPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('credits every source in use, with links that open safely', () => {
    render(
      <MemoryRouter>
        <AboutDataPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'About the data', level: 1 })).toBeInTheDocument()
    for (const heading of [
      'Classical scholars and their works',
      'ISBN country and publisher codes',
      'Your own books',
    ]) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Wikidata' })).toHaveAttribute('href', 'https://www.wikidata.org/')
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('rel', 'noreferrer noopener')
    }
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <MemoryRouter>
        <AboutDataPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'عن مصادر البيانات', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ويكي بيانات' })).toBeInTheDocument()
  })
})
