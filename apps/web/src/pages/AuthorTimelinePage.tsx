import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/context'
import { displayName, formatNumber } from '../authors'
import AuthorTabs from '../components/AuthorTabs'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import TimelineCard from '../components/TimelineCard'
import TimelineDial from '../components/TimelineDial'
import TimelineRuler from '../components/TimelineRuler'
import {
  type DatedScholar,
  fraction,
  hijriToday,
  labelBox,
  placeAuthors,
  scholarsBeside,
  type TimelineData,
} from '../timeline'
import { useWide, useWidth } from '../timelineView'
import { useLoad } from '../useLoad'

/** The width of the author's card on a wide screen (sm:w-84): it sits under its author on the ruler */
const CARD = 336

/**
 * The authors timeline: every author in your library on one ruler, from the first year of the Hijra to today,
 * at the year they died. On a wide screen a ruler that spreads out under the pointer; on a phone a dial. Pin two
 * authors to see the years between them. Authors without a date of death are listed under it, so none is left out.
 */
export default function AuthorTimelinePage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { reload }] = useLoad<TimelineData>('/api/v1/timeline')
  // The general timeline (T2): every scholar in the catalogue too, loaded only when asked for
  const [all, setAll] = useState(false)
  const [catalogue] = useLoad<{ scholars: DatedScholar[] }>(all ? '/api/v1/timeline/scholars' : null)
  const now = useMemo(() => hijriToday(), [])
  const data = loaded.status === 'ok' ? loaded.data : null
  const scholars = all && catalogue.status === 'ok' ? catalogue.data.scholars : null
  const placed = useMemo(
    () =>
      data
        ? placeAuthors(scholars ? [...data.authors, ...scholarsBeside(data.authors, scholars)] : data.authors, now)
        : [],
    [data, scholars, now],
  )
  const [chosen, setChosen] = useState<number | null>(null)
  // A scholar just added to your library: the timeline stays on them once it has reloaded
  const [follow, setFollow] = useState<string | null>(null)
  const [added, setAdded] = useState('')
  const [pins, setPins] = useState<number[]>([])
  const [area, areaWidth] = useWidth(1000)
  const wide = useWide()

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const n = (value: number) => formatNumber(value, language)
  const years = (count: number) => t('timeline.years', { count, number: n(count) })
  // It opens on the author you have the most books by
  const followed = follow ? placed.findIndex((author) => author.id === follow) : -1
  const focus =
    followed >= 0
      ? followed
      : chosen !== null && chosen < placed.length
        ? chosen
        : placed.reduce((best, author, index) => (author.books > placed[best].books ? index : best), 0)
  const focused = placed[focus]

  function pin(index: number) {
    setPins((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : current.length < 2 ? [...current, index] : [index],
    )
  }

  const pinned = pins.map((index) => placed[index]).filter(Boolean)
  const summary =
    pinned.length === 2
      ? t('timeline.apart', {
          first: displayName(pinned[0], language),
          second: displayName(pinned[1], language),
          years: years(Math.abs(pinned[0].year - pinned[1].year)),
        })
      : pinned.length === 1
        ? t('timeline.afterHijra', {
            name: displayName(pinned[0], language),
            after: years(pinned[0].year),
            ago: t('timeline.ago', { years: years(now - pinned[0].year) }),
          })
        : ''

  // Under its author on a wide screen, kept inside the ruler's ends
  const cardAt = focused ? fraction(focused.year, now) : 0
  const [cardFrom] = labelBox(cardAt, CARD, areaWidth)
  const offset = Math.max(0, Math.min(areaWidth - CARD, cardFrom))
  const choose = (index: number) => {
    setFollow(null)
    setChosen(index)
  }
  const switchView = (showAll: boolean) => {
    if (showAll === all) return
    // The same author stays chosen; pins are by place in the list, which changes, so they go
    const current = placed[focus]
    setAll(showAll)
    setFollow(current && !current.scholar ? current.id : null)
    setChosen(null)
    setPins([])
  }
  const view = { placed, now, focus, onFocus: choose, pins, onPin: pin, onClear: () => setPins([]) }
  const card = focused && (
    <TimelineCard
      author={focused}
      sameYear={placed.filter((author) => author.year === focused.year && author !== focused)}
      now={now}
      pinned={pins.includes(focus)}
      compareWith={pins.length === 1 && pins[0] !== focus ? placed[pins[0]] : null}
      onPin={() => pin(focus)}
      onAdded={(author) => {
        setPins([])
        setFollow(author.id)
        setAdded(t('timeline.added', { name: displayName(author, language) }))
        reload()
      }}
    />
  )

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="page-title">{t('authors.title')}</h1>
          <p className="lede">{t('timeline.lede')}</p>
        </div>
        <Link to="/authors/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          {t('authors.add')}
        </Link>
      </header>
      <AuthorTabs current="timeline" />

      <div
        role="group"
        aria-label={t('timeline.mode.label')}
        className="mt-6 inline-flex gap-1 rounded-full border border-line p-1"
      >
        {([false, true] as const).map((showAll) => (
          <button
            key={String(showAll)}
            type="button"
            aria-pressed={all === showAll}
            className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
              all === showAll ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-ink'
            }`}
            onClick={() => switchView(showAll)}
          >
            {t(showAll ? 'timeline.mode.all' : 'timeline.mode.yours')}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {added}
      </p>

      {(loaded.status === 'loading' || (all && catalogue.status === 'loading')) && <Loading className="mt-8" />}
      {(loaded.status === 'failed' || loaded.status === 'notFound') && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {data && placed.length === 0 && <EmptyState text={t('timeline.empty')} />}

      {focused && (
        <div className="card mt-8 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="section-title">
              {t(scholars ? 'timeline.countAll' : 'timeline.count', { count: placed.length, number: n(placed.length) })}
            </h2>
            <p id="timeline-help" className="max-w-xl text-sm text-muted">
              {t('timeline.help')}
            </p>
          </div>

          <div ref={area}>
            {wide ? <TimelineRuler {...view} /> : <TimelineDial {...view} />}
            <div className="mt-4" style={wide ? { marginInlineStart: offset } : undefined}>
              {card}
            </div>
          </div>

          <div aria-live="polite" className="mt-5 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
            {summary && (
              <>
                <p>{summary}</p>
                <button type="button" className="btn btn-ghost" onClick={() => setPins([])}>
                  {t('timeline.clear')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {data && data.undated.length > 0 && (
        <details className="mt-6">
          <summary className="link cursor-pointer text-sm">
            {t('timeline.undated', { count: data.undated.length, number: n(data.undated.length) })}
          </summary>
          <p className="mt-2 text-sm text-muted">{t('timeline.undatedHint')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.undated.map((author) => (
              <li key={author.id}>
                <Link to={`/authors/${encodeURIComponent(author.id)}/edit`} className="pill border border-line">
                  <bdi>{displayName(author, language)}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
