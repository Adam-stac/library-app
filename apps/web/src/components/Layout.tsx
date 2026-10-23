import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'

const pill =
  'inline-flex min-h-11 items-center rounded-full border border-stone-300 px-4 text-sm hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'

function AccountControls() {
  const { t } = useTranslation()
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [failed, setFailed] = useState(false)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') {
    return (
      <Link to="/sign-in" className={pill}>
        {t('nav.signIn')}
      </Link>
    )
  }

  async function onSignOut() {
    setSigningOut(true)
    setFailed(false)
    const done = await signOut()
    setSigningOut(false)
    if (done) navigate('/', { replace: true })
    else setFailed(true)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-56 truncate text-sm text-stone-700 sm:inline">
        {t('nav.signedInAs')}{' '}
        <bdi dir="ltr" className="font-semibold text-stone-900">
          {state.account.email}
        </bdi>
      </span>
      <button type="button" onClick={() => void onSignOut()} disabled={signingOut} className={pill}>
        {t('nav.signOut')}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-800">
          {t('errors.signOutFailed')}
        </p>
      )}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar'

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-xl font-semibold">
            {t('app.name')}
          </Link>
          <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-3">
            <AccountControls />
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(nextLanguage)}
              lang={nextLanguage}
              className={pill}
            >
              {t('language.switchTo')}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">{children}</main>
    </div>
  )
}
