import { useEffect, useState } from 'react'
import { getJson } from './api'
import { readIsbn } from './isbn'
import type { EditionSummary } from './library'

/** How long typing must pause before the shelf is checked */
const PAUSE_MS = 300

/**
 * The copies of this ISBN the reader already has ("you already have this", ADR 0010). Nothing is asked until what
 * is typed or scanned is a whole, correct ISBN, and then only this account's own shelf is asked (never anything
 * outside the app). {@code excludeId} leaves out the copy being edited. An answer for an ISBN that has since been
 * changed is dropped, and a failed check says nothing: it is a convenience, not a gate.
 */
export function useCopiesWithIsbn(text: string, excludeId: string | null): EditionSummary[] {
  const isbn = readIsbn(text)
  const key = isbn ? `${isbn}|${excludeId ?? ''}` : null
  const [answer, setAnswer] = useState<{ key: string; copies: EditionSummary[] } | null>(null)

  useEffect(() => {
    if (!isbn || !key) return
    let current = true
    const timer = setTimeout(() => {
      const exclude = excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''
      void getJson<{ items: EditionSummary[] }>(`/api/v1/editions/by-isbn?isbn=${isbn}${exclude}`).then((result) => {
        if (current && result.ok && Array.isArray(result.data?.items)) setAnswer({ key, copies: result.data.items })
      })
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [isbn, key, excludeId])

  return key !== null && answer?.key === key ? answer.copies : []
}
