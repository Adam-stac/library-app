import type { Named } from './library'

/*
 * The authors timeline (ADR 0006 data, design: "Authors timeline" on the redesign canvas). Pure functions, so the
 * page stays simple and every rule here is tested: where an author goes on the ruler, how the magnifier spreads
 * the ruler under the pointer, and which labels fit without touching.
 */

export type TimelineTitle = { titleAr: string | null; titleEn: string | null }

/** An author from GET /api/v1/timeline: the year they died as entered (Hijri, CE or both), books and works owned */
export type TimelineAuthor = Named & {
  deathHijri: number | null
  deathCe: number | null
  approximate: boolean
  books: number
  works: number
  titles: TimelineTitle[]
  science: Named | null
}

export type TimelineData = { authors: TimelineAuthor[]; undated: Named[] }

/** An author with the Hijri year the ruler places them at */
export type Placed = TimelineAuthor & { year: number }

const UMM_AL_QURA = 'en-u-ca-islamic-umalqura-nu-latn'
const TABULAR = 'en-u-ca-islamic-civil-nu-latn'

function hijriYearOf(date: Date, calendar: string): number | null {
  try {
    const year = Number.parseInt(new Intl.DateTimeFormat(calendar, { year: 'numeric', timeZone: 'UTC' }).format(date))
    return Number.isFinite(year) ? year : null
  } catch {
    return null
  }
}

/**
 * Today's Hijri year, from the device's date (the Umm al-Qura calendar, as Saudi Arabia uses), so the ruler always
 * ends today. Falls back to the tabular Islamic calendar, which differs by a day at most around a month's start.
 */
export function hijriToday(now: Date = new Date()): number {
  return hijriYearOf(now, UMM_AL_QURA) ?? hijriYearOf(now, TABULAR) ?? Math.floor((now.getUTCFullYear() - 622) * 1.0307)
}

/** The Hijri year that the middle of a CE year falls in: where a death known only by its CE year is placed */
export function hijriOfCe(ce: number): number {
  const year = hijriYearOf(new Date(Date.UTC(ce, 6, 1)), TABULAR)
  return year ?? Math.max(1, Math.round((ce - 622) * 1.0307))
}

/**
 * The authors who can be placed (from the first year of the Hijra to today), earliest first. Authors who died in
 * the same year keep a steady order: by name.
 */
export function placeAuthors(authors: TimelineAuthor[], now: number): Placed[] {
  return authors
    .map((author) => ({ ...author, year: author.deathHijri ?? hijriOfCe(author.deathCe ?? 0) }))
    .filter((author) => author.year >= 1 && author.year <= now)
    .sort((a, b) => a.year - b.year || (a.nameEn ?? a.nameAr ?? '').localeCompare(b.nameEn ?? b.nameAr ?? ''))
}

/** Where a year sits along the ruler, from 0 (the first year of the Hijra) to 1 (today) */
export function fraction(year: number, now: number): number {
  return now <= 1 ? 0 : (year - 1) / (now - 1)
}

/** How far either side of the pointer the ruler is spread out, in pixels, and how strongly */
export const LENS = { radius: 170, power: 1.4 }

/**
 * The magnifier: moves a point on the ruler (0 to 1) so the stretch under the pointer is spread apart and the
 * stretch around it squeezed in, with nothing beyond its reach moved at all. `at` is where the pointer is.
 */
export function magnify(point: number, at: number | null, width: number): number {
  if (at === null || width <= 0) return point
  const distance = (point - at) * width
  const away = Math.abs(distance)
  if (away >= LENS.radius) return point
  const u = away / LENS.radius
  const spread = ((LENS.power + 1) * u) / (LENS.power * u + 1)
  return at + (Math.sign(distance) * spread * LENS.radius) / width
}

/** The author drawn nearest to a point on the ruler */
export function nearest(placed: Placed[], point: number, now: number, at: number | null, width: number): number {
  let best = 0
  let bestDistance = Infinity
  placed.forEach((author, index) => {
    const distance = Math.abs(magnify(fraction(author.year, now), at, width) - point)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/** The next author along, one at a time, so every author can be reached (those who died the same year too) */
export function step(placed: Placed[], index: number, direction: 1 | -1): number {
  return Math.min(placed.length - 1, Math.max(0, index + direction))
}

/**
 * Labels that fit: each one is kept only if its box doesn't touch one already kept, in the order given (most
 * important first). `at` is where the label is anchored (0 to 1); labels near either end hang inwards.
 */
export function fitLabels<T extends { at: number; width: number }>(labels: T[], rulerWidth: number, gap = 8): T[] {
  const kept: [number, number][] = []
  return labels.filter((label) => {
    const [from, to] = labelBox(label.at, label.width, rulerWidth)
    if (kept.some(([a, b]) => from < b + gap && to > a - gap)) return false
    kept.push([from, to])
    return true
  })
}

/** Where a label anchored at `at` sits, in pixels from the ruler's start */
export function labelBox(at: number, width: number, rulerWidth: number): [number, number] {
  const x = at * rulerWidth
  const from = at < 0.1 ? x : at > 0.9 ? x - width : x - width / 2
  return [from, from + width]
}

/** How a label is shifted from its anchor (a CSS translate), matching labelBox, for either direction of text */
export function labelShift(at: number, rtl: boolean): string {
  if (at < 0.1) return '0%'
  const away = at > 0.9 ? 100 : 50
  return `${rtl ? away : -away}%`
}

/** A rough width for a line of text, generous so that labels it says fit really do */
export function textWidth(text: string, fontSize: number, arabic: boolean): number {
  return text.length * fontSize * (arabic ? 0.5 : 0.6) + 12
}

/** The century a Hijri year falls in (1 for years 1 to 100) */
export function centuryOf(year: number): number {
  return Math.ceil(year / 100)
}
