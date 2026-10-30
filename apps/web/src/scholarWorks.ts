import { useEffect, useState } from 'react'
import { getJson } from './api'
import type { Named } from './library'

/**
 * The scholars' catalogue (ADR 0010, layer 2, slice L3): classical works and their authors from Wikidata, the same
 * for every reader, searched on our own server. Nothing leaves the app, and nothing is saved until the reader saves
 * the book.
 */

/** A scholar by their Wikidata ID (such as Q9546). The Hijri year only when Wikidata knew the date to the month. */
export type Scholar = {
  id: string
  nameAr: string | null
  nameEn: string | null
  deathHijri: number | null
  deathCe: number | null
}

export type ScholarWork = { id: string; titleAr: string; titleEn: string | null; authors: Scholar[] }

/** How long typing must pause before asking */
const PAUSE_MS = 300
/** The most works offered under the title fields */
export const OFFERED = 5

const QID = /^Q[1-9][0-9]{0,11}$/

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
}

function year(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max && value !== 0
    ? value
    : null
}

/** One scholar from the API's answer, or null when it isn't the expected shape (then it is simply not used). */
function scholar(value: unknown): Scholar | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Record<string, unknown>
  if (typeof s.id !== 'string' || !QID.test(s.id)) return null
  const nameAr = text(s.nameAr, 300)
  const nameEn = text(s.nameEn, 300)
  if (!nameAr && !nameEn) return null
  return { id: s.id, nameAr, nameEn, deathHijri: year(s.deathHijri, 1, 1500), deathCe: year(s.deathCe, -1500, 2100) }
}

function work(value: unknown): ScholarWork | null {
  if (typeof value !== 'object' || value === null) return null
  const w = value as Record<string, unknown>
  const titleAr = text(w.titleAr, 500)
  if (typeof w.id !== 'string' || !QID.test(w.id) || !titleAr || !Array.isArray(w.authors)) return null
  const authors = w.authors.map(scholar).filter((s): s is Scholar => s !== null)
  return authors.length > 0 ? { id: w.id, titleAr, titleEn: text(w.titleEn, 500), authors } : null
}

/** At least two letters or digits: the API's own rule, so nothing is asked that it would refuse. */
export function searchable(textTyped: string): boolean {
  return [...textTyped.trim()].filter((c) => /[\p{L}\p{N}]/u.test(c)).length >= 2 && textTyped.trim().length <= 100
}

/**
 * Classical works matching what is typed in a title field: undefined while there's nothing to ask or the answer for
 * this text hasn't come. A failed request offers nothing: it is a help, not a gate.
 */
export function useScholarWorks(typed: string): ScholarWork[] | undefined {
  const query = searchable(typed) ? typed.trim() : null
  const [answer, setAnswer] = useState<{ query: string; works: ScholarWork[] } | null>(null)

  useEffect(() => {
    if (!query) return
    let current = true
    const timer = setTimeout(() => {
      void getJson<{ items: unknown }>(`/api/v1/reference/works?q=${encodeURIComponent(query)}&limit=${OFFERED}`).then(
        (result) => {
          if (!current || !result.ok || !Array.isArray(result.data?.items)) return
          const works = result.data.items.map(work).filter((w): w is ScholarWork => w !== null)
          setAnswer({ query, works })
        },
      )
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  return query !== null && answer?.query === query ? answer.works : undefined
}

/** The last word of an Arabic name, which is usually the name scholars are known by (البخاري, النووي). */
function knownBy(name: string): string | null {
  const words = name.trim().split(/\s+/)
  const last = words[words.length - 1]
  return words.length > 1 && last && last.length >= 3 ? last : null
}

/**
 * The reader's own authors who may be this scholar: found by the scholar's names, and by the name they are known by
 * (your "البخاري" for Wikidata's "محمد بن إسماعيل البخاري"). The reader chooses; nothing is linked by itself.
 */
export async function yourAuthorsLike(scholarFound: Scholar): Promise<Named[]> {
  const queries = [scholarFound.nameAr, scholarFound.nameEn, scholarFound.nameAr ? knownBy(scholarFound.nameAr) : null]
    .filter((q): q is string => q !== null && searchable(q))
    .filter((q, i, all) => all.indexOf(q) === i)
  const found = new Map<string, Named>()
  for (const q of queries) {
    const result = await getJson<{ authors?: { items?: unknown } }>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=5`)
    const items = result.ok && Array.isArray(result.data?.authors?.items) ? result.data.authors.items : []
    for (const item of items as Named[]) {
      if (item && typeof item.id === 'string' && !found.has(item.id)) found.set(item.id, item)
    }
  }
  return [...found.values()].slice(0, 3)
}
