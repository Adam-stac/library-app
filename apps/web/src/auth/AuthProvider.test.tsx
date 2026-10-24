import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { json } from '../test/fakeApi'
import AuthProvider from './AuthProvider'
import { useAuth } from './context'

function WhoAmI() {
  const { state, refresh } = useAuth()
  return (
    <>
      <p>{state.status === 'signedIn' ? state.account.email : state.status}</p>
      <button type="button" onClick={() => void refresh()}>
        Ask again
      </button>
    </>
  )
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ignores a slow answer that was overtaken by a newer one', async () => {
    let answerFirst: (response: Response) => void = () => {}
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls++
        // The /me sent when the page opened is slow; the second one (after e.g. an email change) is quick
        if (calls === 1) return new Promise<Response>((resolve) => (answerFirst = resolve))
        return Promise.resolve(json(200, { email: 'new@example.org', language: 'en' }))
      }),
    )
    render(
      <AuthProvider>
        <WhoAmI />
      </AuthProvider>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Ask again' }))
    expect(await screen.findByText('new@example.org')).toBeInTheDocument()

    await act(async () => answerFirst(json(200, { email: 'old@example.com', language: 'en' })))

    expect(screen.getByText('new@example.org')).toBeInTheDocument()
    expect(screen.queryByText('old@example.com')).not.toBeInTheDocument()
  })
})
