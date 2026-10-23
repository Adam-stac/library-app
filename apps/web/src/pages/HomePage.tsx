import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
      <p className="mt-3 text-lg text-stone-700">{t('app.tagline')}</p>
      <p className="mt-8">
        <Link
          to="/register"
          className="inline-flex min-h-11 items-center rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          {t('home.createAccount')}
        </Link>
      </p>
      <p className="mt-8 rounded-lg border-s-4 border-stone-400 bg-white ps-4 pe-4 py-3 text-stone-700">
        {t('home.comingSoon')}
      </p>
    </>
  )
}
