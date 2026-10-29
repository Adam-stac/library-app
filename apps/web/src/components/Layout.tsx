import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { saveLanguage } from '../language'
import AccountMenu from './AccountMenu'
import Brand from './Brand'
import Icon from './Icon'
import MoreMenu, { type Section } from './MoreMenu'
import UndoProvider from './UndoProvider'

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

const SECTIONS: Section[] = [
  { to: '/', key: 'home', icon: 'home', end: true },
  { to: '/search', key: 'search', icon: 'search' },
  { to: '/books', key: 'books', icon: 'bookOpen' },
  { to: '/benefits', key: 'benefits', icon: 'quote' },
  { to: '/authors', key: 'authors', icon: 'feather' },
  { to: '/places', key: 'places', icon: 'mapPin' },
  { to: '/sciences', key: 'sciences', icon: 'layers' },
  { to: '/settings', key: 'settings', icon: 'settings' },
]
/** On a phone, the tab bar holds these; search has its own bar above it, and the rest are behind "More" */
const TABS = ['/', '/books', '/benefits', '/authors']
const MORE = SECTIONS.filter(({ to }) => !TABS.includes(to) && to !== '/search')

const sectionLink =
  (phone: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    [
      'min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-xs transition-colors duration-150',
      // On a phone only the tabs show; on a wide screen, every section, in the rail
      phone ? 'flex' : 'hidden lg:flex',
      'lg:w-19 lg:py-2.5',
      isActive
        ? 'font-semibold text-accent lg:bg-surface lg:text-ink lg:shadow-lift'
        : 'font-medium text-muted hover:text-ink lg:hover:bg-surface/60',
    ].join(' ')

/** On a phone, a search box always within reach of the thumb, above the tab bar (not on the search page itself) */
function PhoneSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  if (pathname === '/search') return null

  return (
    <form
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (text.trim()) navigate(`/search?q=${encodeURIComponent(text.trim())}`)
        setText('')
      }}
      className="mx-3 mb-2 flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface ps-4 pe-1.5 shadow-lift lg:hidden"
    >
      <Icon name="search" className="size-4.5 text-muted" />
      <label htmlFor="phone-search" className="sr-only">
        {t('search.label')}
      </label>
      <input
        id="phone-search"
        type="search"
        dir="auto"
        maxLength={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('search.label')}
        className="min-w-0 flex-1 bg-transparent text-reading outline-offset-4"
      />
    </form>
  )
}

/**
 * The frame around every page.
 *
 * Signed in, on a wide screen: a slim rail of sections at the side (the mark, every section, the language and the
 * account at its foot), and the page on a frosted card over a faint wash of colour. On a phone: the mark, the
 * language and the account in a frosted bar along the top, and along the bottom a search box and a tab bar with four
 * sections and "More" for the rest. The rail and the tab bar are one list of links, laid out differently, so the
 * sections are in the page once.
 *
 * Signed out: the mark, signing in and the language along the top, and the page in a single centred column.
 * While checking who is signed in, nothing shows, so the page never jumps from one frame to the other. Every link
 * here leads to a page that exists.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { state } = useAuth()

  const signedIn = state.status === 'signedIn'
  const frame = signedIn ? 'bg-wash min-h-screen lg:flex lg:items-start lg:gap-5 lg:p-5' : 'bg-wash min-h-screen'

  return (
    // Hidden while checking who is signed in, a moment at most: drawing the signed-out frame first and swapping in
    // the sidebar moved the whole page (a layout shift of 0.17 on every signed-in page, measured).
    <UndoProvider>
      <div className={state.status === 'loading' ? `${frame} invisible` : frame}>
        {signedIn ? (
          <aside className="sticky top-0 z-20 lg:top-5 lg:flex lg:h-[calc(100dvh-2.5rem)] lg:w-22 lg:shrink-0 lg:flex-col lg:items-center">
            {/* The phone's top bar is frosted. The frost is a layer of its own, so the tab bar inside the aside can
              still be fixed to the bottom of the screen (a frosted parent would hold it inside the bar). */}
            <div aria-hidden="true" className="glass-bar absolute inset-0 -z-10 border-b border-line lg:hidden" />
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 lg:contents">
              <div className="lg:mt-2 lg:mb-8">
                <Brand compact />
              </div>
              <div className="flex items-center gap-1 lg:order-last lg:mt-auto lg:flex-col lg:gap-2">
                <LanguageButton className="lg:min-h-12 lg:w-19 lg:flex-col lg:gap-1 lg:px-0 lg:text-xs" />
                <AccountMenu email={state.account.email} />
              </div>
            </div>
            <div className="fixed inset-x-0 bottom-0 z-20 pt-2 lg:contents">
              <div aria-hidden="true" className="glass-bar absolute inset-0 -z-10 border-t border-line lg:hidden" />
              <PhoneSearch />
              <nav
                aria-label={t('nav.main')}
                className="grid grid-cols-5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:flex lg:flex-col lg:items-center lg:gap-1.5 lg:p-0"
              >
                {SECTIONS.map(({ to, key, icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={sectionLink(TABS.includes(to))}>
                    <Icon name={icon} className="size-5.5" />
                    {t(`nav.${key}`)}
                  </NavLink>
                ))}
                <MoreMenu sections={MORE} className="lg:hidden" />
              </nav>
            </div>
          </aside>
        ) : (
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
        )}
        {/*
         * The page stays in the same place in both frames. If it moved, React would build it again when the check of
         * who is signed in finishes, and a page that reads a one-time token from the address (confirming a change of
         * email address) would lose it.
         */}
        <main
          className={
            signedIn
              ? 'min-w-0 px-4 pt-6 pb-44 sm:px-8 frame-card lg:min-h-[calc(100dvh-2.5rem)] lg:flex-1 lg:px-12 lg:pt-10 lg:pb-16'
              : 'px-4 pt-10 pb-20 sm:px-8 sm:pt-16'
          }
        >
          {/* Signed out, each page sets its own width (most are narrow forms) and is centred */}
          <div className={signedIn ? 'max-w-5xl' : '[&>*]:mx-auto'}>{children}</div>
        </main>
      </div>
    </UndoProvider>
  )
}
