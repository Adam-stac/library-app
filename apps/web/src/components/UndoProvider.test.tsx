import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { fakeApi } from '../test/fakeApi'
import { useOfferUndo } from '../undo'
import UndoProvider, { UNDO_SECONDS } from './UndoProvider'

function Deleter() {
  const offerUndo = useOfferUndo()
  return (
    <button type="button" onClick={() => offerUndo({ message: 'Benefit moved to the bin.', id: 'b1' })}>
      Delete
    </button>
  )
}

function renderToast() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <UndoProvider>
          <Deleter />
        </UndoProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('UndoProvider', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('says what happened politely, offers Undo, and goes after a while unless the pointer is on it', () => {
    fakeApi({}, 'r@example.com')
    renderToast()
    const line = screen.getByText('', { selector: 'p[aria-live="polite"]' })

    act(() => screen.getByRole('button', { name: 'Delete' }).click())
    expect(line).toHaveTextContent('Benefit moved to the bin.')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    // Held while the pointer is over it, however long that is
    fireEvent.pointerEnter(line)
    act(() => vi.advanceTimersByTime(UNDO_SECONDS * 3000))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    fireEvent.pointerLeave(line)
    act(() => vi.advanceTimersByTime(UNDO_SECONDS * 1000))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(line).toHaveTextContent('')
  })

  it('can be dismissed', () => {
    fakeApi({}, 'r@example.com')
    renderToast()

    act(() => screen.getByRole('button', { name: 'Delete' }).click())
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click())

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})
