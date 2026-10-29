import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { type AuthorSummary, displayName, formatNumber, indexYear, otherName } from '../authors'
import { bookmarkText, formatDate, formatPrice } from '../books'
import BenefitCard from '../components/BenefitCard'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import { indexLetter, sortKey } from '../indexLetter'
import { authorsOf, bookTitle, type HomeSummary, nameOf, type PlacedBookmark, type ShelfBook } from '../library'
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

/** Three classical authors, to show how the app lists a library. An example, so nothing in it is a link. */
const SPECIMEN: AuthorSummary[] = [
  { id: 'bukhari', nameAr: 'البخاري', nameEn: 'al-Bukhārī', birth: year(194), death: year(256) },
  { id: 'tabari', nameAr: 'الطبري', nameEn: 'al-Ṭabarī', birth: year(224), death: year(310) },
  { id: 'nawawi', nameAr: 'النووي', nameEn: 'al-Nawawī', birth: year(631), death: year(676) },
]

function year(hijri: number) {
  return { hijri, ce: null, approximate: false }
}

/** The example book on the landing page: a set of nine volumes, with the bookmark in the third */
const EXAMPLE_BOOK = { titleAr: 'صحيح البخاري', titleEn: 'Ṣaḥīḥ al-Bukhārī', volume: 3, volumes: 9, page: 212 }

/**
 * The landing page, for anyone not signed in. Arabic first, and type first: the headline large, then the app shown
 * rather than described (where you are in a book, and the index of authors, as the app draws them), what you can
 * do with it, and the way in. The examples are pictures of the app, so nothing in them is a link.
 */
function Welcome() {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const n = (value: number) => formatNumber(value, language)
  // In catalogue order for the page's language, as a real list would be
  const specimen = [...SPECIMEN].sort((a, b) =>
    sortKey(displayName(a, language)).localeCompare(sortKey(displayName(b, language)), language),
  )
  const book = language === 'ar' ? EXAMPLE_BOOK.titleAr : EXAMPLE_BOOK.titleEn
  const otherTitle = language === 'ar' ? EXAMPLE_BOOK.titleEn : EXAMPLE_BOOK.titleAr

  return (
    <div className="w-full max-w-5xl">
      <section className="grid grid-cols-1 items-center gap-14 pt-2 sm:pt-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="pill bg-accent-soft text-accent">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            {t('landing.kicker')}
          </p>
          <h1 className="mt-6 font-display text-display leading-display font-semibold text-balance sm:text-landing">
            {t('landing.title')}
          </h1>
          <p className="lede mt-5 max-w-xl text-lg">{t('landing.lede')}</p>
          <p className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className="btn btn-primary min-h-12 px-6">
              {t('home.createAccount')}
            </Link>
            <Link to="/sign-in" className="btn min-h-12 px-6">
              {t('home.signIn')}
            </Link>
          </p>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Icon name="shield" className="size-4" />
            {t('landing.private')}
          </p>
        </div>

        {/* The app, shown: where you are in a book, and the index of authors, as the app draws them */}
        <figure aria-labelledby="specimen" className="relative">
          <figcaption id="specimen" className="sr-only">
            {t('landing.specimen')}
          </figcaption>
          <div className="bg-focal rounded-card p-7 pb-16 shadow-focal sm:me-12 sm:pb-20">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold">
              <Icon name="bookmark" className="size-4" />
              {t('home.where')}
            </p>
            <p className="font-book mt-5 text-2xl leading-snug">
              <bdi>{book}</bdi>
              <span className="block text-base text-focal-muted">
                <bdi>{otherTitle}</bdi>
              </span>
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-1">
              <span aria-hidden="true" className="font-display text-figure leading-figure font-semibold">
                {n(EXAMPLE_BOOK.page)}
              </span>
              <span className="pb-3 text-lg text-focal-muted">
                {t('books.bookmarkAtVolume', { volume: n(EXAMPLE_BOOK.volume), page: n(EXAMPLE_BOOK.page) })}
              </span>
            </div>
            <div aria-hidden="true" className="mt-5">
              <Ruler at={EXAMPLE_BOOK.volume} of={EXAMPLE_BOOK.volumes} />
            </div>
          </div>

          <div className="card relative -mt-8 px-6 pt-5 pb-3 sm:ms-12 sm:-mt-12">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
              <Icon name="feather" className="size-4" />
              {t('nav.authors')}
            </p>
            <ul className="border-t border-line">
              {specimen.map((author) => (
                <li
                  key={author.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-3 last:border-b-0"
                >
                  <span aria-hidden="true" className="font-book text-letter leading-none text-accent">
                    {indexLetter(displayName(author, language))}
                  </span>
                  <span className="min-w-0">
                    <span className="font-book block text-xl leading-snug font-medium">
                      <bdi>{displayName(author, language)}</bdi>
                    </span>
                    <span className="font-book block text-sm text-muted">
                      <bdi>{otherName(author, language)}</bdi>
                    </span>
                  </span>
                  <span className="text-sm text-muted">{indexYear(author, t, language)}</span>
                </li>
              ))}
            </ul>
          </div>
        </figure>
      </section>

      <section aria-labelledby="what-you-can-do" className="mt-24 sm:mt-32">
        <h2 id="what-you-can-do" className="font-display text-title leading-display font-semibold sm:text-title-lg">
          {t('landing.whatTitle')}
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {(
            [
              ['catalogue', 'bookOpen'],
              ['read', 'bookmark'],
              ['benefits', 'quote'],
            ] as const
          ).map(([key, icon]) => (
            <li key={key} className="card p-7">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name={icon} className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{t(`landing.${key}`)}</h3>
              <p className="mt-2 text-muted">{t(`landing.${key}About`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="start"
        className="bg-focal mt-24 flex flex-col items-start gap-6 rounded-card p-8 shadow-focal sm:mt-32 sm:p-12 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="max-w-xl">
          <h2 id="start" className="font-display text-title leading-display font-semibold sm:text-title-lg">
            {t('landing.startTitle')}
          </h2>
          <p className="mt-3 text-lg text-focal-muted">{t('landing.startText')}</p>
        </div>
        <Link
          to="/register"
          className="btn min-h-12 shrink-0 border-transparent bg-focal-ink px-6 text-focal-deep hover:border-transparent hover:opacity-90"
        >
          {t('home.createAccount')}
        </Link>
      </section>
    </div>
  )
}

function Library() {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded] = useLoad<HomeSummary>('/api/v1/home')
  const n = (value: number) => formatNumber(value, language)

  if (loaded.status === 'loading') return <Loading />
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

  const [current, ...alsoReading] = home.recentBookmarks

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          {/* The welcome, then the question the page answers */}
          <h1 className="font-display text-title leading-tight font-semibold text-balance sm:text-hero">
            <span className="text-muted">{t('home.welcome')}</span>
            <br />
            {t('home.question')}
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-pretty text-muted">
            {t('home.holds', {
              books: t('home.books', { count: counts.books, number: n(counts.books) }),
              authors: t('home.authors', { count: counts.authors, number: n(counts.authors) }),
            })}{' '}
            {counts.reading > 0
              ? t('home.reading', { count: counts.reading, number: n(counts.reading) })
              : t('home.readingNone')}
          </p>
        </div>
        <p className="flex flex-wrap gap-2">
          <Link to="/benefits/new" className="btn">
            <Icon name="quote" className="size-4" />
            {t('benefits.add')}
          </Link>
          <Link to="/books/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            {t('books.add')}
          </Link>
        </p>
      </div>

      <HomeSearch />

      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Reading placed={current} />
        <div className="flex min-w-0 flex-col gap-5">
          {alsoReading.length > 0 && (
            <Panel id="also" title={t('home.alsoReading')}>
              <ul className="divide-y divide-line">
                {alsoReading.map((placed) => (
                  <li key={placed.editionId}>
                    <Link
                      to={`/books/${encodeURIComponent(placed.editionId)}`}
                      className="group -mx-2 block rounded-xl px-2 py-3 transition-colors duration-150 hover:bg-hover"
                    >
                      <span className="flex items-baseline justify-between gap-4">
                        <span className="font-book min-w-0 text-xl font-semibold group-hover:text-accent">
                          <bdi>{bookTitle(placed, language)}</bdi>
                        </span>
                        <span className="shrink-0 text-sm text-muted">
                          {bookmarkText(placed.bookmark, t, language)}
                        </span>
                      </span>
                      <VolumeBar placed={placed} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {home.notStarted.length > 0 && (
            <Panel id="not-started" title={t('home.notStarted')} hint={t('home.notStartedHint')}>
              <ShelfList
                books={home.notStarted}
                note={(book) => book.purchasedOn && formatDate(book.purchasedOn, language)}
              />
            </Panel>
          )}
          {home.quiet.length > 0 && (
            <Panel id="quiet" title={t('home.quiet')} hint={t('home.quietHint')}>
              <ShelfList books={home.quiet} note={(book) => book.startedOn && formatDate(book.startedOn, language)} />
            </Panel>
          )}
        </div>
      </div>

      {home.bySciences.length > 0 && <Sciences shares={home.bySciences} books={counts.books} />}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel id="year" title={t('home.thisYear', { year: n(thisYear.year) })} large>
          {/* On a phone, two figures to a row, and the money on a row of its own: amounts are wide */}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Figure label={t('home.started')} value={n(thisYear.started)} />
            <Figure label={t('home.finished')} value={n(thisYear.finished)} accent />
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <dt className="text-sm text-muted">{t('home.spent')}</dt>
              <dd className="font-display mt-2 text-xl leading-snug font-semibold">
                {thisYear.spent.length > 0
                  ? thisYear.spent.map((spent) => (
                      <span key={spent.currency} className="block">
                        {formatPrice(spent, language)}
                      </span>
                    ))
                  : n(0)}
              </dd>
            </div>
          </dl>
        </Panel>

        {home.recentBenefits.length > 0 && (
          <Panel
            id="benefits"
            title={t('home.benefits')}
            large
            end={
              <Link to="/benefits" className="link text-sm">
                {t('home.allBenefits', { number: n(counts.benefits) })}
              </Link>
            }
          >
            <ul className="-my-5 divide-y divide-line">
              {home.recentBenefits.slice(0, 2).map((benefit) => (
                <li key={benefit.id}>
                  <BenefitCard benefit={benefit} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </section>
  )
}

/** On a wide screen, the search box right under the greeting (a phone has one at the bottom of the screen) */
function HomeSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [text, setText] = useState('')

  return (
    <form
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (text.trim()) navigate(`/search?q=${encodeURIComponent(text.trim())}`)
      }}
      className="mt-8 hidden max-w-3xl items-center gap-3 rounded-panel border border-line bg-surface p-2 ps-5 shadow-lift lg:flex"
    >
      <Icon name="search" className="size-5 text-muted" />
      <label htmlFor="home-search" className="sr-only">
        {t('search.label')}
      </label>
      <input
        id="home-search"
        type="search"
        dir="auto"
        maxLength={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('home.searchPlaceholder')}
        className="min-h-11 min-w-0 flex-1 bg-transparent text-reading outline-offset-4"
      />
      <button type="submit" className="btn btn-primary">
        {t('search.button')}
      </button>
    </form>
  )
}

/**
 * The book you're reading, in the deep card the page leads with: its title, its author, and the page you're on as
 * the one large figure, with a ruler through its volumes. The figure is for the eye; the same place is also written
 * out in words for screen readers.
 */
function Reading({ placed }: { placed: PlacedBookmark | undefined }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const n = (value: number) => formatNumber(value, language)

  return (
    <section
      aria-labelledby="home-where"
      className="bg-focal flex min-w-0 flex-col self-start rounded-card p-7 shadow-focal"
    >
      <h2
        id="home-where"
        className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold"
      >
        <Icon name="bookmark" className="size-4" />
        {t('home.where')}
      </h2>
      {placed ? (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0 flex-1 basis-60">
              <Link
                to={`/books/${encodeURIComponent(placed.editionId)}`}
                className="font-book block text-display leading-tight font-semibold break-words hover:underline"
              >
                <bdi>{bookTitle(placed, language)}</bdi>
              </Link>
              {authorsOf(placed.work, language) && (
                <p className="font-book mt-1 text-xl text-focal-muted">
                  <bdi>{authorsOf(placed.work, language)}</bdi>
                </p>
              )}
            </div>
            <p className="text-end">
              <span className="sr-only">{bookmarkText(placed.bookmark, t, language)}</span>
              <span aria-hidden="true" className="block text-sm text-focal-muted">
                {t('books.bookmark.page')}
              </span>
              <span aria-hidden="true" className="font-display block text-figure leading-figure font-semibold">
                {n(placed.bookmark.page)}
              </span>
            </p>
          </div>
          {placed.bookmark.volume !== null && placed.volumes !== null && placed.volumes > 1 && (
            <div aria-hidden="true" className="mt-6">
              <p className="mb-2.5 text-sm text-focal-muted">
                {t('home.volumeOf', { volume: n(placed.bookmark.volume), volumes: n(placed.volumes) })}
              </p>
              <Ruler at={placed.bookmark.volume} of={placed.volumes} />
            </div>
          )}
          <p className="mt-7 flex flex-wrap gap-2.5">
            <Link
              to={`/books/${encodeURIComponent(placed.editionId)}`}
              className="btn border-transparent bg-focal-ink text-focal-deep hover:border-transparent hover:opacity-90"
            >
              <Icon name="bookmark" className="size-4" />
              {t('home.moveBookmark')}
            </Link>
            <Link
              to={`/benefits/new?book=${encodeURIComponent(placed.editionId)}`}
              className="btn border-white/30 bg-transparent text-focal-ink hover:border-white/60"
            >
              {t('home.noteBenefit')}
            </Link>
          </p>
        </>
      ) : (
        <div className="mt-6">
          <p className="max-w-md text-lg">{t('home.readingNone')}</p>
          <Link
            to="/books"
            className="btn mt-5 border-transparent bg-focal-ink text-focal-deep hover:border-transparent hover:opacity-90"
          >
            {t('home.pickBook')}
          </Link>
        </div>
      )}
    </section>
  )
}

/** One mark per volume, filled up to the one you're in; a plain bar when there are too many to tell apart. */
function Ruler({ at, of }: { at: number; of: number }) {
  if (of > 24) {
    return (
      <span className="block h-2 overflow-hidden rounded-full bg-white/15">
        <span className="block h-full rounded-full bg-focal-fill" style={{ width: `${(at / of) * 100}%` }} />
      </span>
    )
  }
  return (
    <span className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${of}, minmax(0, 1fr))` }}>
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`block rounded-full ${
            i + 1 === at ? 'h-4.5 bg-focal-mark' : i + 1 < at ? 'h-2 bg-focal-fill' : 'h-2 bg-white/15'
          }`}
        />
      ))}
    </span>
  )
}

/** A thin bar of how far through its volumes a book is, for sets; nothing for a single volume */
function VolumeBar({ placed }: { placed: PlacedBookmark }) {
  if (placed.bookmark.volume === null || placed.volumes === null || placed.volumes < 2) return null
  return (
    <span aria-hidden="true" className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-track">
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${(placed.bookmark.volume / placed.volumes) * 100}%` }}
      />
    </span>
  )
}

/** The scale of greens, most to least, for the ring of sciences */
const SCALE = ['bg-scale-1', 'bg-scale-2', 'bg-scale-3', 'bg-scale-4', 'bg-scale-5', 'bg-scale-6']
const STROKE = [
  'stroke-scale-1',
  'stroke-scale-2',
  'stroke-scale-3',
  'stroke-scale-4',
  'stroke-scale-5',
  'stroke-scale-6',
]

/**
 * How the library divides between the sciences: a ring in a scale of greens, deepest for the largest share, beside
 * a key with each science, its books and its share. The ring is for the eye; the key carries the numbers. Up to six
 * slices: past that, the rest are put together as "other sciences".
 */
function Sciences({ shares, books }: { shares: HomeSummary['bySciences']; books: number }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const n = (value: number) => formatNumber(value, language)

  const shown = shares.length > 6 ? shares.slice(0, 5) : shares
  const rest = shares.slice(shown.length)
  const slices = [
    ...shown.map((share) => ({
      key: share.science?.id ?? 'none',
      name: share.science ? nameOf(share.science, language) : t('home.noScience'),
      book: share.science !== null,
      books: share.books,
      percent: share.percent,
    })),
    ...(rest.length > 0
      ? [
          {
            key: 'rest',
            name: t('home.otherSciences'),
            book: false,
            books: rest.reduce((sum, share) => sum + share.books, 0),
            percent: rest.reduce((sum, share) => sum + share.percent, 0),
          },
        ]
      : []),
  ]
  const circumference = 2 * Math.PI * 80
  let start = 0

  return (
    <section aria-labelledby="home-sciences" className="card mt-5 p-7">
      <h2 id="home-sciences" className="section-title">
        {t('home.bySciences')}
      </h2>
      <div className="mt-6 flex flex-wrap items-center gap-x-12 gap-y-8">
        <div className="relative mx-auto size-56 shrink-0 sm:mx-0">
          <svg viewBox="0 0 200 200" aria-hidden="true" className="size-full -rotate-90">
            <circle cx="100" cy="100" r="80" fill="none" strokeWidth="22" className="stroke-track" />
            {slices.map((slice, i) => {
              const length = (slice.percent / 100) * circumference
              const arc = (
                <circle
                  key={slice.key}
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  strokeWidth="22"
                  className={STROKE[i]}
                  strokeDasharray={`${Math.max(length - 3, 0.5)} ${circumference}`}
                  strokeDashoffset={-start}
                />
              )
              start += length
              return arc
            })}
          </svg>
          <p aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-stat leading-none font-semibold">{n(books)}</span>
            <span className="mt-1.5 text-sm text-muted">{t('home.inLibrary')}</span>
          </p>
        </div>
        <ul className="grid grid-cols-1 min-w-0 flex-1 basis-80 gap-x-10 sm:grid-cols-2">
          {slices.map((slice, i) => (
            <li key={slice.key} className="flex items-center gap-3 border-b border-line py-3">
              <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm border border-line ${SCALE[i]}`} />
              <bdi className={`min-w-0 flex-1 ${slice.book ? 'font-book text-xl font-semibold' : 'text-muted'}`}>
                {slice.name}
              </bdi>
              <span className="text-sm text-muted">
                {t('home.books', { count: slice.books, number: n(slice.books) })}
              </span>
              <span className="font-display w-14 text-end text-lg font-semibold">
                {t('home.percent', { percent: n(slice.percent) })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Panel({
  id,
  title,
  hint,
  end,
  large = false,
  children,
}: {
  id: string
  title: string
  hint?: string
  end?: ReactNode
  large?: boolean
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`home-${id}`} className={`card min-w-0 ${large ? 'p-7' : 'p-6'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`home-${id}`} className="section-title">
          {title}
        </h2>
        {end}
      </div>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className={large ? 'mt-5' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-display mt-2 text-stat leading-none font-semibold ${accent ? 'text-accent' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function ShelfList({ books, note }: { books: ShelfBook[]; note: (book: ShelfBook) => string | null }) {
  const { i18n } = useTranslation()
  const language = i18n.language
  return (
    <ul className="flex flex-col gap-2">
      {books.map((book) => (
        <li key={book.id}>
          <Link
            to={`/books/${encodeURIComponent(book.id)}`}
            className="group flex items-baseline gap-x-4 rounded-xl bg-field px-4 py-2.5 transition-colors duration-150 hover:bg-hover"
          >
            <bdi className="font-book min-w-0 flex-1 text-reading group-hover:text-accent">
              {bookTitle(book, language)}
            </bdi>
            {note(book) && <span className="shrink-0 text-xs text-muted">{note(book)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
