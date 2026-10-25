import type { Year } from './authors'
import { parseYear } from './hijri'

/** A year as it is being typed in a form: the number as text, its era, and whether it's approximate. */
export type YearDraft = {
  hijri: string
  hijriEra: 'AH' | 'BH'
  ce: string
  ceEra: 'CE' | 'BCE'
  approximate: boolean
}

export const EMPTY_YEAR: YearDraft = { hijri: '', hijriEra: 'AH', ce: '', ceEra: 'CE', approximate: false }

/** The same limits as the API (ADR 0006). */
const LIMITS = { AH: 1500, BH: 2000, CE: 2100, BCE: 1500 }

export function draftOf(year: Year): YearDraft {
  return {
    hijri: year.hijri === null ? '' : String(Math.abs(year.hijri)),
    hijriEra: year.hijri !== null && year.hijri < 0 ? 'BH' : 'AH',
    ce: year.ce === null ? '' : String(Math.abs(year.ce)),
    ceEra: year.ce !== null && year.ce < 0 ? 'BCE' : 'CE',
    approximate: year.approximate,
  }
}

export type YearErrors = { hijri?: string; ce?: string }

/** The year to send, or the errors to show next to the fields. */
export function yearOf(draft: YearDraft): { year: Year; errors: YearErrors } {
  const errors: YearErrors = {}
  const hijri = parseYear(draft.hijri)
  const ce = parseYear(draft.ce)
  if (hijri === 'invalid' || (hijri !== null && hijri > LIMITS[draft.hijriEra])) errors.hijri = 'invalid_year'
  if (ce === 'invalid' || (ce !== null && ce > LIMITS[draft.ceEra])) errors.ce = 'invalid_year'
  const hijriYear = typeof hijri === 'number' && !errors.hijri ? (draft.hijriEra === 'BH' ? -hijri : hijri) : null
  const ceYear = typeof ce === 'number' && !errors.ce ? (draft.ceEra === 'BCE' ? -ce : ce) : null
  return {
    year: { hijri: hijriYear, ce: ceYear, approximate: draft.approximate && (hijriYear !== null || ceYear !== null) },
    errors,
  }
}
