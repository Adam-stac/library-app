import { type PointerEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayName, formatNumber, formatYear } from '../authors'
import { fitLabels, fraction, labelShift, magnify, nearest, type Placed, textWidth } from '../timeline'
import { ALL_NAMES_UP_TO, timelineKeys, type TimelineViewProps, useWidth } from '../timelineView'

/**
 * On a wide screen: the ruler from the first year of the Hijra to today, a hairline for each author at the year
 * they died. Under the pointer the ruler spreads apart, so crowded centuries open up and every author can be
 * stopped at; the pointer always settles on the nearest one. One stop for the keyboard (a slider).
 */
export default function TimelineRuler(props: TimelineViewProps) {
  const { placed, now, focus, onFocus, pins, onPin } = props
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const rtl = language === 'ar'
  const [ref, width] = useWidth(1000)
  const [pointer, setPointer] = useState<number | null>(null)
  const n = (value: number) => formatNumber(value, language)

  const focused = placed[focus]
  const at = pointer ?? fraction(focused.year, now)
  const x = (year: number) => magnify(fraction(year, now), at, width)
  const pct = (point: number) => `${(point * 100).toFixed(3)}%`

  function pointAt(event: PointerEvent<HTMLDivElement>): number {
    const box = event.currentTarget.getBoundingClientRect()
    const along = box.width > 0 ? (event.clientX - box.left) / box.width : 0
    return Math.min(1, Math.max(0, rtl ? 1 - along : along))
  }

  // Decades and centuries: faint hairlines
  const ticks: { key: string; at: number; century: boolean }[] = []
  for (let year = 10; year < now; year += 10) ticks.push({ key: `y${year}`, at: x(year), century: year % 100 === 0 })

  // Authors: one line per year of death; colour only for the one you're on and the pinned ones
  const lines = new Map<number, { at: number; state: 'focus' | 'pinned' | 'plain' }>()
  placed.forEach((author, index) => {
    const state = index === focus ? 'focus' : pins.includes(index) ? 'pinned' : 'plain'
    const current = lines.get(author.year)
    if (!current || (current.state === 'plain' && state !== 'plain') || state === 'focus') {
      lines.set(author.year, { at: x(author.year), state })
    }
  })

  // Names: the one you're on, always; every other name too in a small library, where each fits
  const arabic = rtl
  const showAll = placed.length <= ALL_NAMES_UP_TO
  const nameOf = (author: Placed) => displayName(author, language)
  const focusName = {
    key: focused.id,
    text: nameOf(focused),
    at: x(focused.year),
    width: textWidth(nameOf(focused), arabic ? 24 : 16, arabic),
  }
  const others = showAll
    ? placed
        .filter((_, index) => index !== focus)
        .map((author) => ({
          key: author.id,
          text: nameOf(author),
          at: x(author.year),
          width: textWidth(nameOf(author), arabic ? 17 : 13, arabic),
        }))
        .sort((a, b) => Math.abs(a.at - focusName.at) - Math.abs(b.at - focusName.at))
    : []
  const upper = fitLabels(others, width)
  const higher = fitLabels(
    others.filter((label) => !upper.includes(label)),
    width,
  )

  // Years under the ruler: today first, then the centuries that fit beside it
  const yearLabels = fitLabels(
    [now, 1, 200, 400, 600, 800, 1000, 1200, 1400]
      .filter((year) => year <= now)
      .map((year) => {
        const text =
          year === now
            ? `${t('timeline.today')} · ${t('years.hijri', { year: n(year) })}`
            : t('years.hijri', { year: n(year) })
        return { key: year, text, at: x(year), width: textWidth(text, 12, arabic) }
      }),
    width,
  )

  const pinned = pins.map((index) => placed[index])
  const bracket =
    pinned.length === 2
      ? { from: Math.min(x(pinned[0].year), x(pinned[1].year)), to: Math.max(x(pinned[0].year), x(pinned[1].year)) }
      : null
  const gap = pinned.length === 2 ? Math.abs(pinned[0].year - pinned[1].year) : 0

  const died = formatYear(
    { hijri: focused.deathHijri, ce: focused.deathCe, approximate: focused.approximate },
    t,
    language,
  )

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('timeline.ruler')}
      aria-describedby="timeline-help"
      aria-valuemin={1}
      aria-valuemax={now}
      aria-valuenow={focused.year}
      aria-valuetext={t('timeline.valueText', { name: nameOf(focused), died: t('years.died', { year: died }) })}
      onPointerMove={(event) => {
        const point = pointAt(event)
        setPointer(point)
        onFocus(nearest(placed, point, now, point, width))
      }}
      onPointerLeave={() => setPointer(null)}
      onClick={() => onPin(focus)}
      onKeyDown={(event) => {
        setPointer(null)
        timelineKeys(event, rtl, props)
      }}
      className="timeline relative mt-6 cursor-crosshair touch-none select-none"
    >
      {/* Names */}
      <div aria-hidden="true" className={`relative ${showAll ? 'h-24' : 'h-12'}`}>
        <span
          className="timeline-move font-book absolute bottom-0 text-2xl font-semibold whitespace-nowrap text-accent"
          style={{ insetInlineStart: pct(focusName.at), transform: `translateX(${labelShift(focusName.at, rtl)})` }}
        >
          {focusName.text}
        </span>
        {[upper, higher].map((row, level) =>
          row.map((label) => (
            <span
              key={label.key}
              className={`timeline-move absolute whitespace-nowrap text-muted ${arabic ? 'font-book text-lg' : 'text-sm'}`}
              style={{
                bottom: level === 0 ? '2.25rem' : '3.75rem',
                insetInlineStart: pct(label.at),
                transform: `translateX(${labelShift(label.at, rtl)})`,
              }}
            >
              {label.text}
            </span>
          )),
        )}
      </div>

      {/* The ruler */}
      <div aria-hidden="true" className="relative h-20 border-b border-line">
        {bracket && (
          <>
            <span
              className="timeline-move absolute top-2 h-2 border-x border-t border-accent"
              style={{ insetInlineStart: pct(bracket.from), width: pct(bracket.to - bracket.from) }}
            />
            <span
              className="timeline-move absolute -top-1 bg-surface px-2 text-xs font-semibold whitespace-nowrap text-accent"
              style={{
                insetInlineStart: pct((bracket.from + bracket.to) / 2),
                transform: `translateX(${rtl ? '50%' : '-50%'})`,
              }}
            >
              {t('timeline.years', { count: gap, number: n(gap) })}
            </span>
          </>
        )}
        {ticks.map((tick) => (
          <span
            key={tick.key}
            className={`timeline-move absolute bottom-0 w-px bg-line ${tick.century ? 'h-3' : 'h-1.5'}`}
            style={{ insetInlineStart: pct(tick.at) }}
          />
        ))}
        {[...lines.entries()].map(([year, line]) => (
          <span
            key={year}
            className={`timeline-move absolute bottom-0 ${
              line.state === 'plain'
                ? 'h-6 w-px bg-muted/40'
                : line.state === 'pinned'
                  ? 'h-12 w-0.5 bg-accent'
                  : 'h-16 w-0.5 bg-accent'
            }`}
            style={{ insetInlineStart: pct(line.at) }}
          >
            {line.state !== 'plain' && (
              <span className="absolute -top-1 start-1/2 size-2 -translate-x-1/2 rounded-full bg-accent rtl:translate-x-1/2" />
            )}
          </span>
        ))}
      </div>

      {/* Years: Hijri, with today at the end */}
      <div aria-hidden="true" className="relative h-8">
        {yearLabels.map((label) => (
          <span
            key={label.key}
            className="timeline-move absolute top-2 text-xs font-medium whitespace-nowrap text-muted"
            style={{ insetInlineStart: pct(label.at), transform: `translateX(${labelShift(label.at, rtl)})` }}
          >
            {label.text}
          </span>
        ))}
      </div>
    </div>
  )
}
