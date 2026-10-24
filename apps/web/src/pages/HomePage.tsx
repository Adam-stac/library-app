import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'

export default function HomePage() {
  const { t } = useTranslation()
  const { state } = useAuth()

  return (
    <>
      <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
      <p className="mt-3 text-lg text-stone-700">{t('app.tagline')}</p>
      {state.status === 'signedIn' && (
        <>
          <p className="mt-8 text-lg">
            {t('home.signedIn')}{' '}
            <bdi dir="ltr" className="font-semibold">
              {state.account.email}
            </bdi>
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            <li>
              <Link to="/change-password" className="font-semibold underline underline-offset-4">
                {t('home.changePassword')}
              </Link>
            </li>
            <li>
              <Link to="/two-step-verification" className="font-semibold underline underline-offset-4">
                {t('home.twoFactor')}
              </Link>
            </li>
            <li>
              <Link to="/passkeys" className="font-semibold underline underline-offset-4">
                {t('home.passkeys')}
              </Link>
            </li>
            <li>
              <Link to="/security" className="font-semibold underline underline-offset-4">
                {t('home.security')}
              </Link>
            </li>
            <li>
              <Link to="/account" className="font-semibold underline underline-offset-4">
                {t('home.account')}
              </Link>
            </li>
          </ul>
        </>
      )}
      {state.status === 'signedOut' && (
        <p className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/register"
            className="inline-flex min-h-11 items-center rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            {t('home.createAccount')}
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center rounded-full border border-stone-900 px-6 font-semibold hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            {t('home.signIn')}
          </Link>
        </p>
      )}
      <p className="mt-8 rounded-lg border-s-4 border-stone-400 bg-white ps-4 pe-4 py-3 text-stone-700">
        {t('home.comingSoon')}
      </p>
    </>
  )
}
