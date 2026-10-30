import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJson } from '../api'
import { displayName, formatNumber } from '../authors'
import { type DatedScholar, fraction, hijriToday, labelBox, placeAuthors, scholarsBeside } from '../timeline'
import { useWide, useWidth } from '../timelineView'
import Loading from './Loading'
import TimelineCard from './TimelineCard'
import TimelineDial from './TimelineDial'
import TimelineRuler from './TimelineRuler'

/** The width of the card on a wide screen (sm:w-84): it sits under its scholar on the ruler */
const CARD = 336
/** It opens on al-Bukhārī, whose Ṣaḥīḥ is the example book above it */
const FIRST = 'Q241026'

type Loaded = { status: 'waiting' | 'loading' | 'failed' } | { status: 'ok'; scholars: DatedScholar[] }

/**
 * The general timeline on the landing page (slice T3): every scholar in the catalogue at the year they died, the
 * same one signed-in readers see beside their own authors. Loaded only as the visitor scrolls near it, from the
 * public list (GET /api/v1/public/scholars), so the first screen doesn't wait for it. Its height is kept while it
 * loads, so nothing below it moves.
 */
export default function LandingTimeline() {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  // Without IntersectionObserver (some older browsers), it loads straight away
  const [loaded, setLoaded] = useState<Loaded>(() =>
    typeof IntersectionObserver === 'undefined' ? { status: 'loading' } : { status: 'waiting' },
  )
  const [near, setNear] = useState<HTMLElement | null>(null)
  const now = useMemo(() => hijriToday(), [])
  const placed = useMemo(
    () => (loaded.status === 'ok' ? placeAuthors(scholarsBeside([], loaded.scholars), now) : []),
    [loaded, now],
  )
  const [chosen, setChosen] = useState<number | null>(null)
  const [pins, setPins] = useState<number[]>([])
  const [area, areaWidth] = useWidth(1000)
  const wide = useWide()

  // Start loading when the section comes within a screen or so of the visitor
  useEffect(() => {
    if (!near || loaded.status !== 'waiting') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLoaded({ status: 'loading' })
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(near)
    return () => observer.disconnect()
  }, [near, loaded.status])

  useEffect(() => {
    if (loaded.status !== 'loading') return
    let current = true
    void getJson<{ scholars?: unknown }>('/api/v1/public/scholars').then((result) => {
      if (!current) return
      const scholars = result.ok && Array.isArray(result.data?.scholars) ? result.data.scholars : null
      setLoaded(scholars ? { status: 'ok', scholars: scholars as DatedScholar[] } : { status: 'failed' })
    })
    return () => {
      current = false
    }
  }, [loaded.status])

  const n = (value: number) => formatNumber(value, language)
  const years = (count: number) => t('timeline.years', { count, number: n(count) })
  const first = placed.findIndex((scholar) => scholar.id === FIRST)
  const focus =
    chosen !== null && chosen < placed.length ? chosen : first >= 0 ? first : Math.floor(placed.length / 2)
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
  const [cardFrom] = labelBox(focused ? fraction(focused.year, now) : 0, CARD, areaWidth)
  const offset = Math.max(0, Math.min(areaWidth - CARD, cardFrom))
  const view = { placed, now, focus, onFocus: setChosen, pins, onPin: pin, onClear: () => setPins([]) }

  return (
    <section ref={setNear} aria-labelledby="scholars-timeline" className="mt-24 sm:mt-32">
      <h2 id="scholars-timeline" className="font-display text-title leading-display font-semibold sm:text-title-lg">
        {t('landing.timelineTitle')}
      </h2>
      <p className="lede mt-3 max-w-2xl text-lg">{t('landing.timelineLede')}</p>

      <div className="card mt-8 min-h-[36rem] p-6 sm:min-h-[30rem] sm:p-8">
        {(loaded.status === 'waiting' || loaded.status === 'loading') && <Loading />}
        {loaded.status === 'failed' && <p className="text-muted">{t('landing.timelineFailed')}</p>}
        {focused && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h3 className="section-title">
                {t('landing.timelineCount', { count: placed.length, number: n(placed.length) })}
              </h3>
              <p className="max-w-xl text-sm text-muted">{t('timeline.help')}</p>
            </div>
            <div ref={area}>
              {wide ? <TimelineRuler {...view} /> : <TimelineDial {...view} />}
              <div className="mt-4" style={wide ? { marginInlineStart: offset } : undefined}>
                <TimelineCard
                  author={focused}
                  sameYear={placed.filter((other) => other.year === focused.year && other !== focused)}
                  now={now}
                  pinned={pins.includes(focus)}
                  compareWith={pins.length === 1 && pins[0] !== focus ? placed[pins[0]] : null}
                  onPin={() => pin(focus)}
                  visitor
                />
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
          </>
        )}
      </div>
    </section>
  )
}
