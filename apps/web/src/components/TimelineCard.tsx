import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getJson, postJson } from '../api'
import { displayName, formatNumber, formatYear, otherName } from '../authors'
import { errorMessage, type Named, nameOf, workTitle } from '../library'
import { centuryOf, type Placed, type TimelineTitle } from '../timeline'

type Props = {
  author: Placed
  /** Others who died the same year, named so none is hidden behind the one shown */
  sameYear: Placed[]
  now: number
  pinned: boolean
  /** The one already pinned, when this one would be compared with it */
  compareWith: Placed | null
  onPin: () => void
  /** On a wide screen, how far from the ruler's start the card sits (under its author); full width when absent */
  offset?: number
  /** A scholar from the catalogue was added to your library, as this new author */
  onAdded?: (author: Named) => void
}

/** A catalogue scholar's best-known works, for their card (the first three) */
function useScholarTitles(scholarId: string | null): TimelineTitle[] {
  const [answer, setAnswer] = useState<{ id: string; titles: TimelineTitle[] } | null>(null)
  useEffect(() => {
    if (!scholarId) return
    let current = true
    void getJson<{ items?: unknown }>(`/api/v1/reference/works?scholar=${encodeURIComponent(scholarId)}&limit=3`).then(
      (result) => {
        const items = result.ok && Array.isArray(result.data?.items) ? result.data.items : []
        const titles = items
          .filter((item): item is { titleAr: string; titleEn: string | null } => typeof item?.titleAr === 'string')
          .map((item) => ({ titleAr: item.titleAr, titleEn: typeof item.titleEn === 'string' ? item.titleEn : null }))
        if (current) setAnswer({ id: scholarId, titles })
      },
    )
    return () => {
      current = false
    }
  }, [scholarId])
  return scholarId && answer?.id === scholarId ? answer.titles : []
}

/** The author the timeline is resting on: who they were, when they died, and what of theirs is on your shelves */
export default function TimelineCard({ author, sameYear, now, pinned, compareWith, onPin, offset, onAdded }: Props) {
  const { t, i18n } = useTranslation()
  const scholarTitles = useScholarTitles(author.scholar ? author.id : null)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null)
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const n = (value: number) => formatNumber(value, language)
  const years = (count: number) => t('timeline.years', { count, number: n(count) })
  const centuries = t('timeline.centuries', { returnObjects: true }) as string[]
  const century = centuries[centuryOf(author.year) - 1]
  const died = formatYear(
    { hijri: author.deathHijri, ce: author.deathCe, approximate: author.approximate },
    t,
    language,
  )
  const other = otherName(author, language)
  const shown = author.scholar ? scholarTitles : author.titles
  const titles = shown.map((title) => workTitle(title, language)).join(language === 'ar' ? '، ' : ', ')
  const more = author.works - shown.length

  // A scholar from the catalogue becomes one of your authors, with their names, year of death and link (T2)
  const add = async () => {
    setAdding(true)
    setProblem(null)
    const result = await postJson<Named>(
      '/api/v1/authors',
      {
        nameAr: author.nameAr,
        nameEn: author.nameEn,
        death: { hijri: author.deathHijri, ce: author.deathCe, approximate: false },
        wikidataId: author.id,
      },
      { csrf: true },
    )
    setAdding(false)
    if (result.ok && result.data) onAdded?.(result.data)
    else
      setProblem({
        id: author.id,
        text: errorMessage(
          t,
          language,
          result.ok ? 'unexpected' : (Object.values(result.fieldErrors)[0] ?? result.code),
        ),
      })
  }
  const authorLink = (who: Placed) =>
    who.scholar ? (
      <bdi>{displayName(who, language)}</bdi>
    ) : (
      <Link to={`/authors/${encodeURIComponent(who.id)}`} className="link">
        <bdi>{displayName(who, language)}</bdi>
      </Link>
    )

  return (
    <article
      className="card flex flex-col gap-1 p-5 sm:w-84"
      style={offset === undefined ? undefined : { marginInlineStart: offset }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-book text-2xl leading-snug font-semibold break-words">
            {author.scholar ? (
              <bdi>{displayName(author, language)}</bdi>
            ) : (
              <Link to={`/authors/${encodeURIComponent(author.id)}`} className="hover:underline">
                <bdi>{displayName(author, language)}</bdi>
              </Link>
            )}
          </h2>
          {other && (
            <p className="text-sm text-muted">
              <bdi>{other}</bdi>
            </p>
          )}
        </div>
        {author.science && (
          <span className="pill shrink-0 border border-line text-xs font-medium text-muted">
            <bdi>{nameOf(author.science, language)}</bdi>
          </span>
        )}
      </div>
      {died && <p className="mt-2 text-sm">{t('years.died', { year: died })}</p>}
      <p className="text-sm text-muted">
        {century && t('timeline.century', { ordinal: century })}
        {' · '}
        {t('timeline.ago', { years: years(now - author.year) })}
      </p>
      {sameYear.length > 0 && (
        <p className="mt-1 text-sm">
          {t('timeline.sameYear')}{' '}
          {sameYear.map((other, index) => (
            <span key={other.id}>
              {index > 0 && (language === 'ar' ? '، ' : ', ')}
              {authorLink(other)}
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 text-xs font-medium text-muted">
        {author.scholar ? (
          <>
            {t('timeline.inCatalogue', { count: author.works, number: n(author.works) })}{' '}
            <Link to="/about/data" className="link">
              {t('books.catalogue.about')}
            </Link>
          </>
        ) : (
          t('timeline.books', { count: author.books, number: n(author.books) })
        )}
      </p>
      {titles && (
        <p className="font-book text-lg leading-snug">
          <bdi>{titles}</bdi>
          {more > 0 && <span className="text-muted"> {t('timeline.more', { count: more, number: n(more) })}</span>}
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" aria-pressed={pinned} onClick={onPin}>
          {pinned
            ? t('timeline.unpin')
            : compareWith
              ? t('timeline.compareWith', { name: displayName(compareWith, language) })
              : t('timeline.pin')}
        </button>
        {author.scholar ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={adding}
            aria-busy={adding}
            onClick={() => void add()}
          >
            {t('timeline.addToLibrary')}
          </button>
        ) : (
          <Link to={`/authors/${encodeURIComponent(author.id)}`} className="btn btn-primary">
            {t('timeline.open')}
          </Link>
        )}
      </p>
      {problem?.id === author.id && (
        <p role="alert" className="text-sm text-danger">
          {problem.text}
        </p>
      )}
    </article>
  )
}
