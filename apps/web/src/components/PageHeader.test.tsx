import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PageHeader from './PageHeader'

function renderHeader(book: boolean) {
  render(
    <MemoryRouter>
      <PageHeader
        book={book}
        back={{ to: '/books', label: 'All books' }}
        title="فتح الباري شرح صحيح البخاري"
        actions={<button type="button">Edit</button>}
      />
    </MemoryRouter>,
  )
  const heading = screen.getByRole('heading', { level: 1 })
  const edit = screen.getByRole('button', { name: 'Edit' })
  return edit.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING ? 'above' : 'beside'
}

describe('PageHeader', () => {
  it("on a book's page, puts the actions on the row of the way back, so the title's font can't move them", () => {
    expect(renderHeader(true)).toBe('above')
    expect(screen.getByRole('link', { name: 'All books' })).toHaveAttribute('href', '/books')
  })

  it('on other pages, keeps the actions beside the title', () => {
    expect(renderHeader(false)).toBe('beside')
  })
})
