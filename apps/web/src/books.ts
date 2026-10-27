import type { TFunction } from 'i18next'
import { formatNumber } from './authors'
import type { Edition, Status } from './library'

/*
 * Helpers for books: the copies on the shelf (editions, ADR 0006 and 0007) and the works they are copies of.
 */

/** The languages a book is most often in, offered first in the form; any other ISO 639-1 code can be typed. */
export const COMMON_LANGUAGES = [
  'ar',
  'en',
  'ur',
  'fa',
  'tr',
  'fr',
  'ms',
  'id',
  'bn',
  'so',
  'sw',
  'ha',
  'de',
  'es',
  'ru',
]

/** A language's name in the page's language, such as "Urdu" or "الأردية"; the code itself if the browser can't say. */
export function languageName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The currencies the browser knows (ISO 4217), for the price; a short list if it can't say. */
export function currencies(): string[] {
  try {
    return Intl.supportedValuesOf('currency')
  } catch {
    return ['GBP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'EGP', 'JOD', 'MAD', 'TRY', 'PKR', 'INR', 'MYR', 'IDR']
  }
}

/** "Saudi riyal (SAR)", in the page's language. */
export function currencyName(code: string, language: string): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'currency' }).of(code)
    return name && name !== code ? `${name} (${code})` : code
  } catch {
    return code
  }
}

/** "SAR 95.50" or "٩٥٫٥٠ ر.س.‏": an amount the API sent as decimal text, in its currency. */
export function formatPrice(price: { amount: string; currency: string }, language: string): string {
  const amount = Number(price.amount)
  try {
    return new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-arab' : 'en', {
      style: 'currency',
      currency: price.currency,
    }).format(amount)
  } catch {
    return `${price.amount} ${price.currency}`
  }
}

/** A date the API sent as "yyyy-mm-dd", as "3 March 2026" or "٣ مارس ٢٠٢٦" (read as a calendar date, not a time). */
export function formatDate(date: string, language: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-u-nu-arab' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/** Today as "yyyy-mm-dd" where the reader is, which is what a date field holds. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "Reading", "Finished" or "Not started", in the page's language. */
export function statusText(status: Status, t: TFunction): string {
  return t(`books.status.${status}`)
}

/** "12 volumes", for a set; null for a single volume or when unknown. */
export function volumesText(volumes: number | null, t: TFunction, language: string): string | null {
  return volumes && volumes > 1
    ? t('books.volumesCount', { count: volumes, number: formatNumber(volumes, language) })
    : null
}

/** Where the bookmark is: "Volume 3, page 120" or "Page 45". */
export function bookmarkText(
  bookmark: { volume: number | null; page: number },
  t: TFunction,
  language: string,
): string {
  const page = formatNumber(bookmark.page, language)
  return bookmark.volume !== null
    ? t('books.bookmarkAtVolume', { volume: formatNumber(bookmark.volume, language), page })
    : t('books.bookmarkAt', { page })
}

/**
 * What the API needs to save an edition, from one it sent: everything as it is, so a change to one thing (starting
 * to read, say) keeps the rest. `workId` keeps it with the same work.
 */
export function editionInputOf(edition: Edition) {
  return {
    workId: edition.work.id,
    title: edition.title,
    language: edition.language,
    translator: edition.translator,
    muhaqqiq: edition.muhaqqiq,
    publisher: edition.publisher,
    publicationPlace: edition.publicationPlace,
    published: edition.published,
    editionNumber: edition.editionNumber,
    volumes: edition.volumes,
    isbn: edition.isbn,
    legalDeposit: edition.legalDeposit,
    shelf: edition.shelf,
    notes: edition.notes,
    purchasedOn: edition.purchasedOn,
    price: edition.price,
    startedOn: edition.startedOn,
    finishedOn: edition.finishedOn,
  }
}
