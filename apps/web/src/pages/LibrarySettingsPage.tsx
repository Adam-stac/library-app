import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { putJson } from '../api'
import { useAuth } from '../auth/context'
import { currencies, currencyName } from '../books'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { errorMessage } from '../library'
import { useLoad } from '../useLoad'

type Settings = { defaultCurrency: string | null }

/** Settings for the library itself: for now, the currency a new book's price starts in. */
export default function LibrarySettingsPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { replace }] = useLoad<Settings>('/api/v1/library-settings')
  const [chosen, setChosen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const current = loaded.status === 'ok' ? (loaded.data.defaultCurrency ?? '') : ''
  const currency = chosen ?? current

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    const result = await putJson<Settings>('/api/v1/library-settings', { defaultCurrency: currency || null }, null)
    setSaving(false)
    if (result.ok && result.data) {
      replace(result.data)
      setChosen(null)
      setSaved(true)
    } else if (!result.ok) {
      if (result.status === 401) void refresh()
      else setError(Object.values(result.fieldErrors)[0] ?? result.code)
    }
  }

  return (
    <section className="max-w-xl">
      <PageHeader back={{ to: '/settings', label: t('settings.title') }} title={t('librarySettings.title')} />

      {loaded.status === 'failed' && (
        <p role="alert" className="mt-6 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {saved && (
        <p role="status" className="notice mt-6">
          <Icon name="check" className="mt-px size-4 text-accent" />
          {t('common.saved')}
        </p>
      )}

      {loaded.status === 'ok' && (
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-10 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="defaultCurrency" className="label">
              {t('librarySettings.currency')}
            </label>
            <select
              id="defaultCurrency"
              value={currency}
              onChange={(event) => {
                setChosen(event.target.value)
                setSaved(false)
              }}
              aria-describedby="defaultCurrency-hint"
              aria-invalid={error ? true : undefined}
              className="field"
            >
              <option value="">{t('librarySettings.noCurrency')}</option>
              {currencies().map((code) => (
                <option key={code} value={code}>
                  {currencyName(code, language)}
                </option>
              ))}
            </select>
            <p id="defaultCurrency-hint" className="text-sm text-muted">
              {t('librarySettings.currencyHint')}
            </p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(t, language, error)}
              </p>
            )}
          </div>
          <p>
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
              {t('common.save')}
            </button>
          </p>
        </form>
      )}
    </section>
  )
}
