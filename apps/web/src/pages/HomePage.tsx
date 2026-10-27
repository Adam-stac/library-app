import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import { bookmarkText, formatDate, formatPrice } from '../books'
import BenefitCard from '../components/BenefitCard'
import { Mark } from '../components/Brand'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import { authorsOf, bookTitle, type HomeSummary, nameOf, type ShelfBook } from '../library'
import { useLoad } from '../useLoad'

/**
 * The home page. Signed in: the library at a glance (GET /api/v1/home): where you are in the books you're reading,
 * the latest benefits, how the library divides between the sciences, this year's reading and spending, and books
 * bought but not yet started, or gone quiet. Signed out: what the app is, and the way in.
 */
export default function HomePage() {
  const { state } = useAuth()
  if (state.status === 'signedIn') return <Library />
  if (state.status === 'signedOut') return <Welcome />
  return null
}

function Welcome() {
  const { t } = useTranslation()

  return (
    <section className="flex max-w-lg flex-col items-center pt-4 text-center sm:pt-10">
      <Mark className="h-24 sm:h-28" />
      <h1 className="page-title mt-10">{t('home.title')}</h1>
      <p className="lede text-[1.0625rem]">{t('app.tagline')}</p>
      <p className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to="/register" className="btn btn-primary px-5">
          {t('home.createAccount')}
        </Link>
        <Link to="/sign-in" className="btn px-5">
          {t('home.signIn')}
        </Link>
      </p>
    </section>
  )
}

function Library() {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded] = useLoad<HomeSummary>('/api/v1/home')
  const n = (value: number) => formatNumber(value, language)

  if (loaded.status === 'loading') return null
  if (loaded.status !== 'ok') {
    return (
      <section>
        <h1 className="page-title">{t('home.title')}</h1>
        <p role="alert" className="mt-6 text-danger">
          {t('common.loadFailed')}
        </p>
      </section>
    )
  }

  const home = loaded.data
  const { counts, thisYear } = home

  if (counts.books === 0) {
    return (
      <section className="max-w-3xl">
        <h1 className="page-title">{t('home.title')}</h1>
        <p className="lede">{t('app.tagline')}</p>
        <EmptyState text={t('home.empty')}>
          <p className="flex flex-wrap gap-2">
            <Link to="/books/new" className="btn btn-primary">
              <Icon name="plus" className="size-4" />
              {t('books.add')}
            </Link>
            <Link to="/authors/new" className="btn">
              {t('authors.add')}
            </Link>
          </p>
        </EmptyState>
      </section>
    )
  }

  return (
    <section>
      <h1 className="page-title">{t('home.title')}</h1>
      {/* The library in one sentence, rather than a row of numbers */}
      <p className="mt-4 max-w-3xl text-xl leading-relaxed text-pretty text-muted sm:text-2xl">
        {t('home.holds', {
          books: t('home.books', { count: counts.books, number: n(counts.books) }),
          authors: t('home.authors', { count: counts.authors, number: n(counts.authors) }),
        })}{' '}
        {counts.reading > 0
          ? t('home.reading', { count: counts.reading, number: n(counts.reading) })
          : t('home.readingNone')}
      </p>

      <div className="mt-14 grid gap-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-14">
          {home.recentBookmarks.length > 0 && (
            <Part id="where" title={t('home.where')}>
              <ul className="divide-y divide-line border-y border-line">
                {home.recentBookmarks.map((placed) => (
                  <li key={placed.editionId}>
                    <Link
                      to={`/books/${encodeURIComponent(placed.editionId)}`}
                      className="group -mx-3 flex items-baseline gap-x-6 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <bdi className="font-book block text-xl leading-snug font-medium group-hover:text-accent">
                          {bookTitle(placed, language)}
                        </bdi>
                        {authorsOf(placed.work, language) && (
                          <bdi className="font-book block text-sm text-muted">{authorsOf(placed.work, language)}</bdi>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                        <Icon name="bookmark" className="size-3.5 text-accent" />
                        {bookmarkText(placed.bookmark, t, language)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Part>
          )}

          {home.recentBenefits.length > 0 && (
            <Part id="benefits" title={t('home.benefits')}>
              <ul className="divide-y divide-line border-y border-line">
                {home.recentBenefits.map((benefit) => (
                  <li key={benefit.id}>
                    <BenefitCard benefit={benefit} />
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                <Link to="/benefits" className="link text-sm">
                  {t('home.allBenefits', { number: n(counts.benefits) })}
                </Link>
              </p>
            </Part>
          )}

          {home.bySciences.length > 0 && (
            <Part id="sciences" title={t('home.bySciences')}>
              <ul className="flex flex-col gap-4">
                {home.bySciences.map((share) => (
                  <li
                    key={share.science?.id ?? 'none'}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5"
                  >
                    <bdi className={share.science ? 'font-book text-[1.0625rem]' : 'text-muted'}>
                      {share.science ? nameOf(share.science, language) : t('home.noScience')}
                    </bdi>
                    <span className="text-sm text-muted">
                      {t('home.share', {
                        percent: n(share.percent),
                        books: t('home.books', { count: share.books, number: n(share.books) }),
                      })}
                    </span>
                    {/* The bar repeats the percentage beside it, so it is only for the eye */}
                    <span aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-hover">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(share.percent, 1)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Part>
          )}
        </div>

        <div className="flex flex-col gap-14">
          <Part id="year" title={t('home.thisYear', { year: n(thisYear.year) })}>
            <dl className="divide-y divide-line border-y border-line">
              <Row label={t('home.started')} value={n(thisYear.started)} />
              <Row label={t('home.finished')} value={n(thisYear.finished)} />
              <Row
                label={t('home.spent')}
                value={
                  thisYear.spent.length > 0
                    ? thisYear.spent.map((spent) => formatPrice(spent, language)).join(language === 'ar' ? '، ' : ', ')
                    : n(0)
                }
              />
            </dl>
          </Part>

          {home.notStarted.length > 0 && (
            <Part id="not-started" title={t('home.notStarted')} hint={t('home.notStartedHint')}>
              <ShelfList
                books={home.notStarted}
                note={(book) => book.purchasedOn && formatDate(book.purchasedOn, language)}
              />
            </Part>
          )}

          {home.quiet.length > 0 && (
            <Part id="quiet" title={t('home.quiet')} hint={t('home.quietHint')}>
              <ShelfList books={home.quiet} note={(book) => book.startedOn && formatDate(book.startedOn, language)} />
            </Part>
          )}
        </div>
      </div>
    </section>
  )
}

function Part({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`home-${id}`}>
      <h2 id={`home-${id}`} className="section-title">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function ShelfList({ books, note }: { books: ShelfBook[]; note: (book: ShelfBook) => string | null }) {
  const { i18n } = useTranslation()
  const language = i18n.language
  return (
    <ul className="divide-y divide-line border-y border-line">
      {books.map((book) => (
        <li key={book.id}>
          <Link
            to={`/books/${encodeURIComponent(book.id)}`}
            className="group -mx-3 flex items-baseline gap-x-4 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-hover"
          >
            <bdi className="font-book min-w-0 flex-1 text-[1.0625rem] group-hover:text-accent">
              {bookTitle(book, language)}
            </bdi>
            {note(book) && <span className="shrink-0 text-sm text-muted">{note(book)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
