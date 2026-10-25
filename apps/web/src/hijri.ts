/**
 * Hijri and CE years (ADR 0006). Hijri years are positive after the Hijra (AH) and negative before it (BH); CE years
 * are negative before year 1 (BCE). Neither calendar has a year 0.
 *
 * A Hijri year is about 11 days shorter than a CE year, so it usually starts in one CE year and ends in the next.
 * The CE years are worked out with the standard tabular Islamic calendar, and with the Julian calendar before
 * 15 October 1582 (as historians date that period), the Gregorian one after.
 */

/** Julian Day number of 1 Muharram 1 AH (Friday 16 July 622, Julian calendar). */
const ISLAMIC_EPOCH = 1948439.5
/** The first day of the Gregorian calendar, 15 October 1582. */
const GREGORIAN_START = 2299161

/** Hijri years with no year 0 → counted years (1 BH → 0, 2 BH → -1), which the formulas need. */
function counted(hijri: number): number {
  return hijri > 0 ? hijri : hijri + 1
}

function startOfHijriYear(countedYear: number): number {
  return ISLAMIC_EPOCH + 354 * (countedYear - 1) + Math.floor((3 + 11 * countedYear) / 30)
}

/** The year a Julian Day falls in, counted astronomically (0 = 1 BCE). Meeus, Astronomical Algorithms, ch. 7. */
function calendarYearOf(julianDay: number): number {
  const z = Math.floor(julianDay + 0.5)
  let a = z
  if (z >= GREGORIAN_START) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    a = z + 1 + alpha - Math.floor(alpha / 4)
  }
  const b = a + 1524
  const c = Math.floor((b - 122.1) / 365.25)
  const d = Math.floor(365.25 * c)
  const e = Math.floor((b - d) / 30.6001)
  const month = e < 14 ? e - 1 : e - 13
  return month > 2 ? c - 4716 : c - 4715
}

/** Astronomical year → CE year as people write it (0 → 1 BCE, written -1). */
function toCe(astronomical: number): number {
  return astronomical <= 0 ? astronomical - 1 : astronomical
}

/** The first and last CE year that a Hijri year overlaps (the same year when it falls inside one). */
export function ceYearsOf(hijri: number): [number, number] {
  const year = counted(hijri)
  return [toCe(calendarYearOf(startOfHijriYear(year))), toCe(calendarYearOf(startOfHijriYear(year + 1) - 1))]
}

/**
 * Reads a year typed in Western, Arabic-Indic (٠–٩) or Persian (۰–۹) digits. Returns null when empty, and
 * 'invalid' for anything that isn't a whole number from 1 to 9999.
 */
export function parseYear(text: string): number | null | 'invalid' {
  const digits = text.trim().replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf))
  if (digits === '') return null
  if (!/^\d{1,4}$/.test(digits)) return 'invalid'
  const year = Number(digits)
  return year === 0 ? 'invalid' : year
}
