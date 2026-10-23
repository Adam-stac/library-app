import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar'

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-xl font-semibold">
            {t('app.name')}
          </Link>
          <button
            type="button"
            onClick={() => void i18n.changeLanguage(nextLanguage)}
            lang={nextLanguage}
            className="min-h-11 rounded-full border border-stone-300 px-4 text-sm hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            {t('language.switchTo')}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">{children}</main>
    </div>
  )
}
