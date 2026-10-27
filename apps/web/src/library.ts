import type { TFunction } from 'i18next'
import { formatNumber } from './authors'

/*
 * The library's records as the API sends them (ADR 0006, ADR 0007), and small helpers shared by their pages.
 */

export type Named = { id: string; nameAr: string | null; nameEn: string | null }

export type PlaceSummary = Named & { countryAr: string | null; countryEn: string | null; shared: boolean }

export type Place = PlaceSummary & {
  otherNames: string[]
  latitude: number | null
  longitude: number | null
  version: number
}

export type PlacePage = { items: PlaceSummary[]; page: number; size: number; total: number }

export type Science = Named & { version: number }

export type ScienceList = { items: Science[]; total: number }

export type WorkSummary = {
  id: string
  titleAr: string | null
  titleEn: string | null
  science: Named | null
  authors: Named[]
}

export type Work = WorkSummary & { version: number }

export type Bookmark = { volume: number | null; page: number; movedAt: string }

export type Status = 'not_started' | 'reading' | 'finished'

export type EditionSummary = {
  id: string
  work: WorkSummary
  title: string | null
  volumes: number | null
  purchasedOn: string | null
  status: Status
  bookmark: Bookmark | null
}

export type Edition = EditionSummary & {
  language: string | null
  translator: string | null
  muhaqqiq: string | null
  publisher: string | null
  publicationPlace: string | null
  published: { hijri: number | null; ce: number | null }
  editionNumber: number | null
  isbn: string | null
  legalDeposit: string | null
  shelf: string | null
  notes: string | null
  price: { amount: string; currency: string } | null
  startedOn: string | null
  finishedOn: string | null
  version: number
}

export type EditionPage = { items: EditionSummary[]; page: number; size: number; total: number }

/** True when the text has Arabic letters, so a name typed into a search box is filed as the Arabic name. */
export function isArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)
}

/** The name in the page's language, or the other one if that's all there is. */
export function nameOf(record: Named, language: string): string {
  return (language === 'ar' ? (record.nameAr ?? record.nameEn) : (record.nameEn ?? record.nameAr)) ?? ''
}

/** The other name, when there are both. */
export function otherNameOf(record: Named, language: string): string | null {
  if (!record.nameAr || !record.nameEn) return null
  return language === 'ar' ? record.nameEn : record.nameAr
}

/** A work's title in the page's language, or the other one. */
export function workTitle(work: Pick<WorkSummary, 'titleAr' | 'titleEn'>, language: string): string {
  return (language === 'ar' ? (work.titleAr ?? work.titleEn) : (work.titleEn ?? work.titleAr)) ?? ''
}

/** A copy's title: the title on its cover if it has its own, otherwise its work's. */
export function bookTitle(edition: Pick<EditionSummary, 'title' | 'work'>, language: string): string {
  return edition.title ?? workTitle(edition.work, language)
}

/** "al-Bukhari, Ibn Hajar", in the page's language; empty when the work names no author. */
export function authorsOf(work: Pick<WorkSummary, 'authors'>, language: string): string {
  return work.authors.map((author) => nameOf(author, language)).join(language === 'ar' ? '، ' : ', ')
}

/**
 * A whole number typed in a form (Arabic-Indic and Persian digits too), within 1 to `max`. Null when blank,
 * 'invalid' when it isn't one.
 */
export function wholeNumber(text: string, max: number): number | null | 'invalid' {
  const digits = text.trim().replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf))
  if (digits === '') return null
  if (!/^\d{1,6}$/.test(digits)) return 'invalid'
  const value = Number(digits)
  return value < 1 || value > max ? 'invalid' : value
}

/**
 * A decimal number typed in a form, such as a latitude: Arabic-Indic and Persian digits, and the Arabic decimal
 * separator (٫), are accepted. Null when blank, 'invalid' when it isn't one.
 */
export function decimal(text: string): number | null | 'invalid' {
  const plain = text
    .trim()
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[٫,]/g, '.')
    .replace(/^[−–]/, '-')
  if (plain === '') return null
  if (!/^-?\d{1,3}(\.\d{1,10})?$/.test(plain)) return 'invalid'
  return Number(plain)
}

/** Blank text as null, which is how the API is told a field is empty. */
export const orNull = (text: string) => (text.trim() === '' ? null : text)

/**
 * The message for an error code from the API. For 409 in_use it says what still uses the record, such as "Used
 * by 2 authors", when the API said so.
 */
export function errorMessage(
  t: TFunction,
  language: string,
  code: string,
  details: { usedBy?: Record<string, number> } = {},
): string {
  if (code === 'in_use' && details.usedBy) {
    const uses = Object.entries(details.usedBy).map(([kind, count]) =>
      t(`usedBy.${kind}`, { count, number: formatNumber(count, language), defaultValue: '' }),
    )
    if (uses.every((use) => use !== '')) {
      return t('errors.in_use_by', { uses: uses.join(language === 'ar' ? ' و' : ' and ') })
    }
  }
  return t(`errors.${code}`, { defaultValue: t('errors.unexpected') })
}
