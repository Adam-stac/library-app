import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import i18n from './i18n'

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ar')
  })

  it('shows Arabic, right-to-left, by default', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'مرحبًا بك' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })

  it('switches to English, left-to-right, and remembers the choice', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'English' }))

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(localStorage.getItem('language')).toBe('en')
  })

  it('switches back to Arabic', async () => {
    const user = userEvent.setup()
    await i18n.changeLanguage('en')
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'العربية' }))

    expect(await screen.findByRole('heading', { name: 'مرحبًا بك' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
  })
})
