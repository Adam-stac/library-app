import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { displayName, formatNumber, formatYear, otherName } from '../authors'
import { nameOf, workTitle } from '../library'
import { centuryOf, type Placed } from '../timeline'

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
}

/** The author the timeline is resting on: who they were, when they died, and what of theirs is on your shelves */
export default function TimelineCard({ author, sameYear, now, pinned, compareWith, onPin, offset }: Props) {
  const { t, i18n } = useTranslation()
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
  const titles = author.titles.map((title) => workTitle(title, language)).join(language === 'ar' ? '، ' : ', ')
  const more = author.works - author.titles.length

  return (
    <article
      className="card flex flex-col gap-1 p-5 sm:w-84"
      style={offset === undefined ? undefined : { marginInlineStart: offset }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-book text-2xl leading-snug font-semibold break-words">
            <Link to={`/authors/${encodeURIComponent(author.id)}`} className="hover:underline">
              <bdi>{displayName(author, language)}</bdi>
            </Link>
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
              <Link to={`/authors/${encodeURIComponent(other.id)}`} className="link">
                <bdi>{displayName(other, language)}</bdi>
              </Link>
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 text-xs font-medium text-muted">
        {t('timeline.books', { count: author.books, number: n(author.books) })}
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
        <Link to={`/authors/${encodeURIComponent(author.id)}`} className="btn btn-primary">
          {t('timeline.open')}
        </Link>
      </p>
    </article>
  )
}
