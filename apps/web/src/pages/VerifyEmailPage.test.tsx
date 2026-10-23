import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import VerifyEmailPage from './VerifyEmailPage'

function openLink(url: string) {
  window.history.replaceState(null, '', url)
  render(
    <MemoryRouter>
      <VerifyEmailPage />
    </MemoryRouter>,
  )
}

describe('VerifyEmailPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('confirms the token once and removes it from the address bar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    openLink('/verify-email#token=abc123')

    expect(await screen.findByRole('heading', { name: 'Your email is confirmed' })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain('abc123')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ token: 'abc123' })
  })

  it('explains an invalid or expired link and offers to register again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"invalid_token"}', { status: 400 })))

    openLink('/verify-email#token=used')

    expect(await screen.findByRole('heading', { name: 'This link is invalid or has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register again' })).toHaveAttribute('href', '/register')
  })

  it('does not call the API when the link has no token', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    openLink('/verify-email')

    expect(screen.getByRole('heading', { name: 'This link is invalid or has expired' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a general error when the server is busy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    openLink('/verify-email#token=abc123')

    expect(await screen.findByRole('heading', { name: "We couldn't confirm your email just now" })).toBeInTheDocument()
  })
})
