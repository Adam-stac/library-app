/*
 * The letter a name is filed under, as in the index of a book: البخاري under ب, ابن حجر under ا, al-Nawawi under N.
 * Lists come from the API in catalogue order (library_sort_key, in the V16 migration), so this repeats the
 * database's rules exactly: the same letters are folded together, and the same leading article is skipped.
 */

const FROM = 'أإآٱىةؤئāīūēōḥṣḍṭẓġḳṯḏḫšžáéíóú٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'
const TO = 'اااايهويaiueohsdtzgktdhszaeiou01234567890123456789'
// Removed altogether: transliteration marks for ʿayn and hamza, and apostrophes
const DROPPED = new Set(['ʿ', 'ʾ', "'", '’', '‘', '`', 'ʻ', 'ʼ'])
const FOLDED = new Map([...FROM].map((letter, i) => [letter, TO[i]]))

/** The database's library_search_key */
export function searchKey(value: string): string {
  // Vowel marks (U+064B to U+065F, and the dagger alif U+0670) and the tatweel (U+0640) go first
  const folded = [...value.toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '')]
    .filter((c) => !DROPPED.has(c))
    .map((c) => FOLDED.get(c) ?? c)
    .join('')
  return folded.replace(/\s+/g, ' ').trim()
}

/** The database's library_sort_key: the search key without a leading article */
export function sortKey(value: string): string {
  return searchKey(value).replace(/^(ال|al-|al |el-|the |an |a )/, '')
}

/**
 * The first letter or digit of the name's sort key, as it should be shown: capital for Latin letters, without
 * accents. Punctuation before it is skipped, as the database's ordering skips it. Empty if there is none.
 */
export function indexLetter(name: string): string {
  const first = sortKey(name).match(/[\p{L}\p{N}]/u)?.[0] ?? ''
  return first.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
}
