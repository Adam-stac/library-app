import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '../auth/AuthProvider'
import i18n from '../i18n'
import { clearCsrfCookie, fakeApi, json } from '../test/fakeApi'
import LibrarySettingsPage from './LibrarySettingsPage'

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LibrarySettingsPage />
      </AuthProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('LibrarySettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    clearCsrfCookie()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chooses the default currency, with no version needed', async () => {
    const api = fakeApi(
      {
        '/api/v1/library-settings': (init) =>
          init.method === 'PUT' ? json(200, { defaultCurrency: 'SAR' }) : json(200, { defaultCurrency: null }),
      },
      'r@example.com',
    )
    const user = renderPage()

    const currency = await screen.findByLabelText('Default currency')
    expect(currency).toHaveValue('')
    await user.selectOptions(currency, 'SAR')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved.')
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')![1] as RequestInit
    expect((put.headers as Record<string, string>)['If-Match']).toBeUndefined()
    expect(JSON.parse(put.body as string)).toEqual({ defaultCurrency: 'SAR' })
    expect(currency).toHaveValue('SAR')
  })

  it('clears the default currency', async () => {
    const api = fakeApi(
      {
        '/api/v1/library-settings': (init) =>
          init.method === 'PUT' ? json(200, { defaultCurrency: null }) : json(200, { defaultCurrency: 'GBP' }),
      },
      'r@example.com',
    )
    const user = renderPage()

    await user.selectOptions(await screen.findByLabelText('Default currency'), '')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('status')
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')![1] as RequestInit
    expect(JSON.parse(put.body as string)).toEqual({ defaultCurrency: null })
  })
})
