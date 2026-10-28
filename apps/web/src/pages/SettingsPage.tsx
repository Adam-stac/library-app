import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/context'
import Icon, { type IconName } from '../components/Icon'
import { chooseTheme, savedTheme, type Theme } from '../theme'

/** Every setting, in one place: the account's, and how the app looks on this device. Signed-in accounts only. */
const SETTINGS: { to: string; key: string; icon: IconName }[] = [
  { to: '/library-settings', key: 'library', icon: 'bookOpen' },
  { to: '/account', key: 'account', icon: 'user' },
  { to: '/security', key: 'security', icon: 'shield' },
  { to: '/change-password', key: 'changePassword', icon: 'key' },
  { to: '/two-step-verification', key: 'twoFactor', icon: 'phone' },
  { to: '/passkeys', key: 'passkeys', icon: 'fingerprint' },
]

export default function SettingsPage() {
  const { t } = useTranslation()
  const { state } = useAuth()

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">{t('settings.title')}</h1>
      <ul className="card mt-10 divide-y divide-line overflow-hidden">
        {SETTINGS.map(({ to, key, icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-hover"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon name={icon} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{t(`settings.${key}`)}</span>
                <span className="text-sm text-muted">{t(`settings.${key}About`)}</span>
              </span>
              <Icon name="forward" className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <ThemeChoice />
    </div>
  )
}

const THEME_OPTIONS: { value: Theme; icon: IconName }[] = [
  { value: 'system', icon: 'monitor' },
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
]

/** Automatic (as the device is set), light or dark. Changes at once, and is kept on this device only (theme.ts). */
function ThemeChoice() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(savedTheme)

  return (
    <section aria-labelledby="appearance" className="mt-12">
      <h2 id="appearance" className="section-title">
        {t('settings.appearance')}
      </h2>
      <p id="appearance-about" className="mt-1 text-sm text-muted">
        {t('settings.appearanceAbout')}
      </p>
      <fieldset aria-describedby="appearance-about" className="mt-4">
        <legend className="sr-only">{t('settings.theme.legend')}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
          {THEME_OPTIONS.map(({ value, icon }) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-muted transition-colors duration-150 select-none hover:bg-hover hover:text-ink has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => {
                  chooseTheme(value)
                  setTheme(value)
                }}
                className="sr-only"
              />
              <Icon name={icon} className="size-4 shrink-0" />
              {t(`settings.theme.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
