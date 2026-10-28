import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/context'
import Icon, { type IconName } from '../components/Icon'

/** Every account setting, in one place. Signed-in accounts only. */
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
    </div>
  )
}
