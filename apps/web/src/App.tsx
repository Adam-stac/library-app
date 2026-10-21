import { useTranslation } from 'react-i18next'

export default function App() {
  const { t, i18n } = useTranslation()
  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar'

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <span className="text-xl font-semibold">{t('app.name')}</span>
          <button
            type="button"
            onClick={() => void i18n.changeLanguage(nextLanguage)}
            aria-label={t('language.switchLabel')}
            lang={nextLanguage}
            className="min-h-11 rounded-full border border-stone-300 px-4 text-sm hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            {t('language.switchTo')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        <p className="mt-3 text-lg text-stone-700">{t('app.tagline')}</p>
        <p className="mt-8 rounded-lg border-s-4 border-stone-400 bg-white ps-4 pe-4 py-3 text-stone-700">
          {t('home.comingSoon')}
        </p>
      </main>
    </div>
  )
}
