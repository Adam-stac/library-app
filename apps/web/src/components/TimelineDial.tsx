import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayName, formatNumber, formatYear, otherName } from '../authors'
import { centuryOf } from '../timeline'
import { timelineKeys, type TimelineViewProps, useWidth } from '../timelineView'

/** Pixels per year on the dial: a century is 400 px, so neighbours stand apart under the needle */
const PER_YEAR = 4

/**
 * On a phone: the ruler as a dial, like the one in a photo editor. The needle stays in the middle; drag the ruler
 * under it, and when you let go it settles on the nearest author, whose name and year show large above it.
 */
export default function TimelineDial(props: TimelineViewProps) {
  const { placed, now, focus, onFocus, pins } = props
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const rtl = language === 'ar'
  const [ref, width] = useWidth(360)
  // While dragging, the year under the needle follows the finger; otherwise it rests on the focused author
  const [drag, setDrag] = useState<{ x: number; from: number; year: number } | null>(null)
  const n = (value: number) => formatNumber(value, language)

  const focused = placed[focus]
  const under = drag ? drag.year : focused.year
  const middle = width / 2
  const seen = (width / 2 + 24) / PER_YEAR
  const at = (year: number) => middle + (year - under) * PER_YEAR

  const nearestTo = (year: number) =>
    placed.reduce(
      (best, author, index) => (Math.abs(author.year - year) < Math.abs(placed[best].year - year) ? index : best),
      0,
    )

  const ticks: { year: number; century: boolean }[] = []
  for (let year = Math.max(10, Math.ceil((under - seen) / 10) * 10); year <= Math.min(now, under + seen); year += 10) {
    ticks.push({ year, century: year % 100 === 0 })
  }
  const lines = [...new Set(placed.map((author) => author.year))].filter((year) => Math.abs(year - under) <= seen)
  const pinnedYears = new Set(pins.map((index) => placed[index].year))

  const died = formatYear(
    { hijri: focused.deathHijri, ce: focused.deathCe, approximate: focused.approximate },
    t,
    language,
  )
  const centuries = t('timeline.centuries', { returnObjects: true }) as string[]
  const other = otherName(focused, language)

  return (
    <div>
      {/* The readout: who is under the needle */}
      <div aria-hidden="true" className="text-center">
        <p className="font-book text-3xl leading-snug font-semibold">
          <bdi>{displayName(focused, language)}</bdi>
        </p>
        {other && (
          <p className="text-xs text-muted">
            <bdi>{other}</bdi>
          </p>
        )}
        <p className="mt-1 font-display text-stat leading-none font-semibold">
          {t('years.hijri', { year: n(focused.year) })}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t('timeline.century', { ordinal: centuries[centuryOf(focused.year) - 1] })}
        </p>
      </div>

      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={t('timeline.ruler')}
        aria-describedby="timeline-help"
        aria-valuemin={1}
        aria-valuemax={now}
        aria-valuenow={focused.year}
        aria-valuetext={t('timeline.valueText', {
          name: displayName(focused, language),
          died: t('years.died', { year: died }),
        })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setDrag({ x: event.clientX, from: focused.year, year: focused.year })
        }}
        onPointerMove={(event) => {
          if (!drag) return
          // The ruler moves with the finger: in Arabic, later years come in from the left
          const moved = (event.clientX - drag.x) / PER_YEAR
          const year = Math.min(now, Math.max(1, drag.from + (rtl ? moved : -moved)))
          setDrag({ ...drag, year })
          onFocus(nearestTo(year))
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(event) => timelineKeys(event, rtl, props)}
        className="timeline relative mt-4 h-28 cursor-grab touch-none overflow-hidden select-none"
      >
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-20 border-b border-line">
          {ticks.map((tick) => (
            <span
              key={tick.year}
              className={`absolute bottom-0 w-px bg-line ${drag ? '' : 'timeline-move'} ${tick.century ? 'h-3' : 'h-1.5'}`}
              style={{ insetInlineStart: at(tick.year) }}
            />
          ))}
          {lines.map((year) => (
            <span
              key={year}
              className={`absolute bottom-0 ${drag ? '' : 'timeline-move'} ${
                pinnedYears.has(year) ? 'h-12 w-0.5 bg-accent' : 'h-7 w-px bg-muted/40'
              }`}
              style={{ insetInlineStart: at(year) }}
            />
          ))}
          {/* The needle */}
          <span className="absolute bottom-0 h-16 w-0.5 bg-accent" style={{ insetInlineStart: middle }}>
            <span className="absolute -top-1 start-1/2 size-2 -translate-x-1/2 rounded-full bg-accent rtl:translate-x-1/2" />
          </span>
        </div>
        <div aria-hidden="true" className="absolute inset-x-0 top-22">
          {ticks
            .filter((tick) => tick.century)
            .map((tick) => (
              <span
                key={tick.year}
                className={`absolute text-xs font-medium whitespace-nowrap text-muted ${drag ? '' : 'timeline-move'}`}
                style={{ insetInlineStart: at(tick.year), transform: `translateX(${rtl ? '50%' : '-50%'})` }}
              >
                {t('years.hijri', { year: n(tick.year) })}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
