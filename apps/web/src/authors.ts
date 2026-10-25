import type { TFunction } from 'i18next'
import { ceYearsOf } from './hijri'

export type Year = { hijri: number | null; ce: number | null; approximate: boolean }

/** How the API names a place that an author refers to. */
export type PlaceName = { id: string; nameAr: string | null; nameEn: string | null }

export type Author = {
  id: string
  nameAr: string | null
  nameEn: string | null
  fullName: string | null
  ism: string | null
  kunya: string | null
  laqab: string | null
  nisba: string | null
  birth: Year
  death: Year
  birthPlace: PlaceName | null
  deathPlace: PlaceName | null
  biography: string | null
  version: number
}

export type AuthorSummary = Pick<Author, 'id' | 'nameAr' | 'nameEn' | 'birth' | 'death'>

export type AuthorPage = { items: AuthorSummary[]; page: number; size: number; total: number }

/** The name to show first: the one in the page's language, or the other if that's all there is. */
export function displayName(author: Pick<Author, 'nameAr' | 'nameEn'>, language: string): string {
  return (language === 'ar' ? (author.nameAr ?? author.nameEn) : (author.nameEn ?? author.nameAr)) ?? ''
}

/** The other name, when the author has both. */
export function otherName(author: Pick<Author, 'nameAr' | 'nameEn'>, language: string): string | null {
  if (!author.nameAr || !author.nameEn) return null
  return language === 'ar' ? author.nameEn : author.nameAr
}

/** Numbers without thousands separators, in Arabic-Indic digits for Arabic. */
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-arab' : 'en', { useGrouping: false }).format(value)
}

function ceText(from: number, to: number, t: TFunction, language: string): string {
  const one = (year: number) =>
    year < 0
      ? t('years.bce', { year: formatNumber(-year, language) })
      : t('years.ce', { year: formatNumber(year, language) })
  if (from === to) return one(from)
  if (from < 0 && to > 0) return `${one(from)}–${one(to)}`
  const key = to < 0 ? 'years.bceRange' : 'years.ceRange'
  return t(key, { from: formatNumber(Math.abs(from), language), to: formatNumber(Math.abs(to), language) })
}

/**
 * How a year reads: "256 AH (869–870 CE)", "c. 51 BH (573 CE)", "٢٥٦هـ (٨٦٩–٨٧٠م)". A CE year the user typed is
 * shown as typed; otherwise the CE years are worked out from the Hijri year. Null when there's no year.
 */
export function formatYear(year: Year, t: TFunction, language: string): string | null {
  let text: string
  if (year.hijri !== null) {
    const hijri =
      year.hijri < 0
        ? t('years.beforeHijra', { year: formatNumber(-year.hijri, language) })
        : t('years.hijri', { year: formatNumber(year.hijri, language) })
    const [from, to] = year.ce !== null ? [year.ce, year.ce] : ceYearsOf(year.hijri)
    text = t('years.both', { hijri, ce: ceText(from, to, t, language) })
  } else if (year.ce !== null) {
    text = ceText(year.ce, year.ce, t, language)
  } else {
    return null
  }
  return year.approximate ? t('years.approximate', { year: text }) : text
}

/** "Born …", "Died …", or both, for a line under the name. Null when no years are known. */
export function lifeYears(author: Pick<Author, 'birth' | 'death'>, t: TFunction, language: string): string | null {
  const birth = formatYear(author.birth, t, language)
  const death = formatYear(author.death, t, language)
  if (birth && death) return t('years.lifespan', { birth, death })
  if (death) return t('years.died', { year: death })
  if (birth) return t('years.born', { year: birth })
  return null
}

/** True when a CE year on show was worked out, not typed. */
export function hasWorkedOutCe(author: Pick<Author, 'birth' | 'death'>): boolean {
  return [author.birth, author.death].some((year) => year.hijri !== null && year.ce === null)
}
