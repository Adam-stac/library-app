import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/context'
import { saveLanguage } from '../language'
import AccountMenu from './AccountMenu'
import Brand from './Brand'
import Icon, { type IconName } from './Icon'

/** The button that switches between Arabic and English, labelled in the language it switches to. */
function LanguageButton({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar'

  return (
    <button
      type="button"
      onClick={() => void saveLanguage(nextLanguage, state.status === 'signedIn')}
      lang={nextLanguage}
      className={`btn btn-ghost px-3 ${className}`}
    >
      <Icon name="languages" className="size-4" />
      {t('language.switchTo')}
    </button>
  )
}

const SECTIONS: { to: string; key: string; icon: IconName; end?: boolean }[] = [
  { to: '/', key: 'home', icon: 'home', end: true },
  { to: '/authors', key: 'authors', icon: 'feather' },
  { to: '/settings', key: 'settings', icon: 'settings' },
]

const navLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors duration-150 ${
    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-ink'
  }`

/**
 * The frame around every page.
 *
 * Signed in: the library's sections, the language and the account menu. Wide screens get a sidebar; phones get a
 * frosted top bar (the page scrolls under it) with the sections in a row under it. Pages sit at the start of the
 * space beside the sidebar, up to the width of a list; forms and reading pages narrow themselves.
 *
 * Signed out, or while checking: the mark, signing in and the language along the top, and the page in a single
 * centred column. Every link here leads to a page that exists; sections are added as their pages are built.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { state } = useAuth()

  if (state.status === 'signedIn') {
    return (
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="glass-bar sticky top-0 z-10 border-b border-line lg:h-screen lg:border-e lg:border-b-0 lg:bg-paper lg:backdrop-filter-none">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-1 gap-y-2 px-4 pt-3 pb-2 lg:flex lg:h-full lg:flex-col lg:items-stretch lg:gap-0 lg:px-3 lg:pt-6 lg:pb-3">
            <div className="px-1 lg:px-2">
              <Brand />
            </div>
            <nav
              aria-label={t('nav.main')}
              className="col-span-2 row-start-2 -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:mt-8 lg:flex-col lg:overflow-visible lg:px-0"
            >
              {SECTIONS.map(({ to, key, icon, end }) => (
                <NavLink key={to} to={to} end={end} className={navLink}>
                  <Icon name={icon} />
                  {t(`nav.${key}`)}
                </NavLink>
              ))}
            </nav>
            <div className="col-start-2 row-start-1 flex items-center gap-1 lg:relative lg:mt-auto lg:flex-col lg:items-stretch">
              <LanguageButton className="lg:justify-start" />
              <AccountMenu email={state.account.email} />
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-4 pt-8 pb-16 sm:px-8 lg:px-14 lg:pt-14">
          <div className="max-w-5xl">{children}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Brand />
          <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-1">
            {state.status === 'signedOut' && (
              <Link to="/sign-in" className="btn btn-ghost">
                {t('nav.signIn')}
              </Link>
            )}
            <LanguageButton />
          </nav>
        </div>
      </header>
      {/* Each page sets its own width (most are narrow forms) and is centred */}
      <main className="px-4 pt-10 pb-20 sm:px-8 sm:pt-16 [&>*]:mx-auto">{children}</main>
    </div>
  )
}
