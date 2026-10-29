import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { fakeApi } from '../test/fakeApi'
import SettingsPage from './SettingsPage'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sign-in" element={<h1>Sign in page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.removeItem('theme')
    delete document.documentElement.dataset.theme
  })

  it('lists every setting, each with what it is for', async () => {
    fakeApi({}, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/library-settings',
      '/bin',
      '/account',
      '/security',
      '/change-password',
      '/two-step-verification',
      '/passkeys',
    ])
    expect(screen.getByRole('link', { name: /Passkeys/ })).toHaveTextContent('fingerprint')
  })

  it('chooses light or dark for this device, at once, or goes back to automatic', async () => {
    fakeApi({}, 'reader@example.com')
    renderPage()

    const themes = await screen.findByRole('group', { name: 'Theme' })
    expect(themes).toHaveAccessibleDescription(
      "Automatic follows your device's light or dark setting. Kept on this device only.",
    )
    expect(screen.getByRole('radio', { name: 'Automatic' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')

    await userEvent.click(screen.getByRole('radio', { name: 'Automatic' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('shows the choice already made on this device', async () => {
    localStorage.setItem('theme', 'light')
    fakeApi({}, 'reader@example.com')
    renderPage()

    expect(await screen.findByRole('radio', { name: 'Light' })).toBeChecked()
  })

  it('sends you to sign in when you are signed out', async () => {
    fakeApi({})
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument()
  })
})
