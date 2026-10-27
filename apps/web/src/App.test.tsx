import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import i18n from './i18n'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ar')
    // Not signed in
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 401 }))),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows Arabic, right-to-left, by default', async () => {
    renderApp()

    expect(await screen.findByRole('heading', { name: 'مرحبًا بك' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })

  it('switches to English, left-to-right, and remembers the choice', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'English' }))

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(localStorage.getItem('language')).toBe('en')
  })

  it('switches back to Arabic', async () => {
    const user = userEvent.setup()
    await i18n.changeLanguage('en')
    renderApp()

    await user.click(screen.getByRole('button', { name: 'العربية' }))

    expect(await screen.findByRole('heading', { name: 'مرحبًا بك' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })

  it('links from the home page to registration', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('link', { name: 'إنشاء حساب' }))

    expect(await screen.findByRole('heading', { name: 'إنشاء حساب' })).toBeInTheDocument()
  })

  it('says so when an address has no page, rather than showing the home page', async () => {
    const user = userEvent.setup()
    renderApp('/no-such-page')

    expect(screen.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'اذهب إلى الصفحة الرئيسية' }))

    expect(await screen.findByRole('heading', { name: 'مرحبًا بك' })).toBeInTheDocument()
  })

  it('names the app خِزانة, in Amiri, with its Latin name on the English page', async () => {
    renderApp()
    expect(screen.getByRole('link', { name: 'خِزانة' })).toHaveAttribute('href', '/')

    await i18n.changeLanguage('en')
    expect(await screen.findByRole('link', { name: 'Khizāna' })).toHaveAttribute('href', '/')
  })
})
