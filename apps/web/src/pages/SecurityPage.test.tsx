import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { callTo, clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import { type ActiveSession, type SecurityEvent } from '../security'
import SecurityPage from './SecurityPage'

const LAPTOP: ActiveSession = {
  handle: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  device: 'Chrome on Windows',
  ip: '203.0.113.7',
  signedInAt: '2026-10-20T10:00:00Z',
  lastActiveAt: '2026-10-24T09:00:00Z',
  current: true,
}
const PHONE: ActiveSession = {
  handle: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  device: 'Safari on iPhone',
  ip: '198.51.100.4',
  signedInAt: '2026-10-21T10:00:00Z',
  lastActiveAt: '2026-10-23T09:00:00Z',
  current: false,
}
const event = (type: string, detail: string | null = null): SecurityEvent => ({
  type,
  detail,
  device: 'Chrome on Windows',
  ip: '203.0.113.7',
  occurredAt: '2026-10-24T09:00:00Z',
})

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/security']}>
      <AuthProvider>
        <Routes>
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SecurityPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })

  it('lists where you are signed in, this device first, and the recent activity in plain words', async () => {
    fakeApi(
      {
        '/api/v1/auth/sessions': () => json(200, [LAPTOP, PHONE]),
        '/api/v1/auth/security-events': () =>
          json(200, [
            event('passkey_added', 'Phone'),
            event('account_locked'),
            event('sign_in_failed', 'wrong_password'),
            event('sign_in', 'passkey'),
            event('recovery_code_used', '7 left'),
            event('registration_attempt'),
            event('something_new'),
          ]),
      },
      'reader@example.com',
    )
    renderPage()

    expect(await screen.findByText('This device')).toBeInTheDocument()
    const where = screen.getByRole('list', { name: "Where you're signed in" })
    const activity = screen.getByRole('list', { name: 'Recent security activity' })
    expect(within(where).getAllByRole('listitem')).toHaveLength(2)
    expect(within(where).getAllByRole('listitem')[0]).toHaveTextContent('Chrome on Windows')
    expect(screen.getByRole('button', { name: 'Sign out Safari on iPhone' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out Chrome on Windows' })).not.toBeInTheDocument()

    expect(within(activity).getByText('Passkey “Phone” added')).toBeInTheDocument()
    expect(within(activity).getByText(/Sign-in was paused for 15 minutes/)).toBeInTheDocument()
    expect(within(activity).getByText('A sign-in failed: wrong password')).toBeInTheDocument()
    expect(within(activity).getByText('Signed in with a passkey')).toBeInTheDocument()
    expect(within(activity).getByText('A recovery code was used (7 left)')).toBeInTheDocument()
    expect(within(activity).getByText('Account security changed')).toBeInTheDocument()
    expect(within(activity).getByText('Someone tried to create an account with your email address')).toBeInTheDocument()
  })

  it('signs out another device', async () => {
    let ended = false
    const api = fakeApi(
      {
        '/api/v1/auth/sessions': () => json(200, ended ? [LAPTOP] : [LAPTOP, PHONE]),
        '/api/v1/auth/security-events': () => json(200, []),
        [`/api/v1/auth/sessions/${PHONE.handle}/end`]: () => {
          ended = true
          return json(204)
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Safari on iPhone was signed out.')
    expect(screen.getByText("You're only signed in here.")).toBeInTheDocument()
    const headers = callTo(api, `/api/v1/auth/sessions/${PHONE.handle}/end`).headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBe('csrf-123')
  })

  it('signs out everywhere else', async () => {
    let ended = false
    fakeApi(
      {
        '/api/v1/auth/sessions': () => json(200, ended ? [LAPTOP] : [LAPTOP, PHONE]),
        '/api/v1/auth/security-events': () => json(200, ended ? [event('other_sessions_ended', '1')] : []),
        '/api/v1/auth/sessions/end-others': () => {
          ended = true
          return json(204)
        },
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }))

    expect(await screen.findByRole('status')).toHaveTextContent('You were signed out everywhere else.')
    expect(await screen.findByText('Signed out of 1 other device')).toBeInTheDocument()
  })

  it('explains when the device was already signed out', async () => {
    fakeApi(
      {
        '/api/v1/auth/sessions': () => json(200, [LAPTOP, PHONE]),
        '/api/v1/auth/security-events': () => json(200, []),
        [`/api/v1/auth/sessions/${PHONE.handle}/end`]: () =>
          json(400, { code: 'not_found', title: 'Bad Request', status: 400 }),
      },
      'reader@example.com',
    )
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That device was already signed out.')
  })

  it('speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    fakeApi(
      {
        '/api/v1/auth/sessions': () => json(200, [LAPTOP]),
        '/api/v1/auth/security-events': () => json(200, [event('other_sessions_ended', '3')]),
      },
      'reader@example.com',
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'الأمان' })).toBeInTheDocument()
    expect(await screen.findByText('هذا الجهاز')).toBeInTheDocument()
    expect(screen.getByText('سُجّل الخروج من 3 أجهزة أخرى')).toBeInTheDocument()
  })
})
