import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import { formatInstant } from '../books'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { authorsOf, bookTitle, nameOf, otherNameOf, type SearchResults, workTitle } from '../library'
import { useLoad } from '../useLoad'

const LIMIT = 10

/**
 * One search across the library: books, works, authors, places and benefits. Matching ignores vowel marks and the
 * tatweel, and treats أ إ آ as ا, ة as ه and ى as ي (the API's rules, ADR 0006). The text is kept in the address
 * (`?q=`), so a search can be shared, reloaded and reached with Back.
 */
export default function SearchPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const query = (searchParams.get('q') ?? '').trim()
  const searchable = /[\p{L}\p{N}]/u.test(query)
  const [loaded] = useLoad<SearchResults>(
    searchable ? `/api/v1/search?q=${encodeURIComponent(query)}&limit=${LIMIT}` : null,
  )
  const [typed, setTyped] = useState<{ query: string; text: string } | null>(null)
  const text = typed?.query === query ? typed.text : query

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = text.trim()
    if (next) navigate(`/search?q=${encodeURIComponent(next)}`)
  }

  const results = searchable && loaded.status === 'ok' ? loaded.data : null
  const total = results
    ? results.editions.total +
      results.works.total +
      results.authors.total +
      results.places.total +
      results.benefits.total
    : 0
  const n = (value: number) => formatNumber(value, language)

  return (
    <section className="max-w-3xl">
      <PageHeader title={t('search.title')} lede={t('search.intro')} />

      <form role="search" onSubmit={onSubmit} className="mt-8 flex gap-2">
        <label htmlFor="q" className="sr-only">
          {t('search.label')}
        </label>
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            id="q"
            type="search"
            dir="auto"
            maxLength={100}
            value={text}
            onChange={(event) => setTyped({ query, text: event.target.value })}
            className="field font-book w-full ps-9 text-[1.0625rem]"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          {t('search.button')}
        </button>
      </form>

      {searchable && loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {results && (
        <p role="status" className="mt-8 text-sm text-muted">
          {total === 0 ? t('search.nothing', { query }) : t('search.found', { count: total, number: n(total), query })}
        </p>
      )}

      {results && total > 0 && (
        <div className="mt-6 flex flex-col gap-10">
          <Group id="books" title={t('nav.books')} shown={results.editions.items.length} total={results.editions.total}>
            {results.editions.items.map((book) => (
              <Hit
                key={book.id}
                to={`/books/${encodeURIComponent(book.id)}`}
                primary={bookTitle(book, language)}
                secondary={authorsOf(book.work, language)}
              />
            ))}
          </Group>
          <Group id="works" title={t('search.works')} shown={results.works.items.length} total={results.works.total}>
            {results.works.items.map((work) => (
              <Hit
                key={work.id}
                to={`/books?work=${encodeURIComponent(work.id)}`}
                primary={workTitle(work, language)}
                secondary={authorsOf(work, language)}
              />
            ))}
          </Group>
          <Group
            id="authors"
            title={t('nav.authors')}
            shown={results.authors.items.length}
            total={results.authors.total}
          >
            {results.authors.items.map((author) => (
              <Hit
                key={author.id}
                to={`/authors/${encodeURIComponent(author.id)}`}
                primary={nameOf(author, language)}
                secondary={otherNameOf(author, language)}
              />
            ))}
          </Group>
          <Group id="places" title={t('nav.places')} shown={results.places.items.length} total={results.places.total}>
            {results.places.items.map((place) => (
              <Hit
                key={place.id}
                to={`/places/${encodeURIComponent(place.id)}`}
                primary={nameOf(place, language)}
                secondary={otherNameOf(place, language)}
              />
            ))}
          </Group>
          <Group
            id="benefits"
            title={t('nav.benefits')}
            shown={results.benefits.items.length}
            total={results.benefits.total}
          >
            {results.benefits.items.map((benefit) => (
              <Hit
                key={benefit.id}
                to={`/benefits/${encodeURIComponent(benefit.id)}`}
                primary={benefit.shortened ? `${benefit.excerpt}…` : benefit.excerpt}
                secondary={formatInstant(benefit.createdAt, language)}
                long
              />
            ))}
          </Group>
        </div>
      )}
    </section>
  )
}

function Group({
  id,
  title,
  shown,
  total,
  children,
}: {
  id: string
  title: string
  shown: number
  total: number
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  if (total === 0) return null
  return (
    <section aria-labelledby={`found-${id}`}>
      <h2 id={`found-${id}`} className="section-title flex items-baseline gap-2">
        {title}
        <span className="text-sm font-normal text-muted">
          {shown < total
            ? t('search.showingOf', {
                shown: formatNumber(shown, i18n.language),
                total: formatNumber(total, i18n.language),
              })
            : formatNumber(total, i18n.language)}
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-line border-y border-line">{children}</ul>
    </section>
  )
}

function Hit({
  to,
  primary,
  secondary,
  long = false,
}: {
  to: string
  primary: string
  secondary?: string | null
  long?: boolean
}) {
  return (
    <li>
      <Link
        to={to}
        className="group -mx-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-hover"
      >
        <bdi
          className={`font-book break-words group-hover:text-accent ${long ? 'line-clamp-3 w-full text-[1.0625rem] leading-relaxed' : 'text-lg'}`}
          dir="auto"
        >
          {primary}
        </bdi>
        {secondary && <bdi className="font-book text-sm text-muted">{secondary}</bdi>}
      </Link>
    </li>
  )
}
