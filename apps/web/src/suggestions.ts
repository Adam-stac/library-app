import { useEffect, useState } from 'react'
import { getJson } from './api'
import { readIsbn } from './isbn'

/**
 * Filling in a new copy's details from its ISBN (ADR 0010, layer 1, slice L2). The API answers from the reader's own
 * books and from the ISBN itself, and nothing else; nothing is saved until the reader presses Save.
 */

/** The fields a suggestion can fill. */
export const FILLABLE = ['publisher', 'publicationPlace', 'language'] as const
export type Fillable = (typeof FILLABLE)[number]

/** Where a value came from, so the note beside the field can say. */
export type SuggestedFrom = 'yourBooks' | 'country' | 'languageArea' | 'publisher'

/**
 * One suggested value; {@code country} (ISO 3166) is set when it came from the ISBN's country, or is where the publisher
 * works when it came from an Arabic publisher's own code on another country's ISBN.
 */
export type Suggested = { value: string; from: SuggestedFrom; country: string | null }

export type Suggestions = Record<Fillable, Suggested | null>

/** What to fill when there's no ISBN to go on: nothing, and anything filled before is taken back out. */
export const NO_SUGGESTIONS: Suggestions = { publisher: null, publicationPlace: null, language: null }

/** How long typing must pause before asking */
const PAUSE_MS = 300

const FROM: readonly string[] = ['yourBooks', 'country', 'languageArea', 'publisher']

/** One field of the API's answer, or null if it is missing or not the expected shape (it is then simply not used). */
function suggested(value: unknown): Suggested | null {
  if (typeof value !== 'object' || value === null) return null
  const field = value as Record<string, unknown>
  if (typeof field.value !== 'string' || field.value.length === 0 || field.value.length > 200) return null
  if (typeof field.from !== 'string' || !FROM.includes(field.from)) return null
  const country = typeof field.country === 'string' && /^[A-Z]{2}$/.test(field.country) ? field.country : null
  return { value: field.value, from: field.from as SuggestedFrom, country }
}

/**
 * What the API suggests for the ISBN in the field. {@link NO_SUGGESTIONS} while the field doesn't hold a whole,
 * correct ISBN; undefined while asking (the form then leaves what it has). {@code excludeId} is the copy being edited,
 * which mustn't suggest its own details back. An answer for an ISBN since changed is dropped, and a failed request
 * leaves things as they are: it is a convenience, not a gate.
 */
export function useIsbnSuggestions(text: string, excludeId: string | null): Suggestions | undefined {
  const isbn = readIsbn(text)
  const key = isbn ? `${isbn}|${excludeId ?? ''}` : null
  const [answer, setAnswer] = useState<{ key: string; suggestions: Suggestions } | null>(null)

  useEffect(() => {
    if (!isbn || !key) return
    let current = true
    const timer = setTimeout(() => {
      const exclude = excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''
      void getJson<Record<string, unknown>>(`/api/v1/editions/suggestions?isbn=${isbn}${exclude}`).then((result) => {
        if (!current || !result.ok || typeof result.data !== 'object' || result.data === null) return
        const data = result.data
        setAnswer({
          key,
          suggestions: {
            publisher: suggested(data.publisher),
            publicationPlace: suggested(data.publicationPlace),
            language: suggested(data.language),
          },
        })
      })
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [isbn, key, excludeId])

  if (key === null) return NO_SUGGESTIONS
  return answer?.key === key ? answer.suggestions : undefined
}

/** The values filled in for the reader and not edited since, by field. */
export type Filled = Partial<Record<Fillable, Suggested>>

/**
 * Applies suggestions to a draft. Only an empty field, or one still holding an earlier suggestion the reader hasn't
 * touched, is filled: what the reader typed is never replaced. An earlier suggestion that no longer applies (the ISBN
 * changed) is taken back out. Returns the new draft (the same object if nothing changed) and what is now filled.
 */
export function fillIn<D extends Record<Fillable, string>>(
  draft: D,
  filled: Filled,
  suggestions: Suggestions,
): { draft: D; filled: Filled } {
  let next = draft
  const nowFilled: Filled = {}
  for (const field of FILLABLE) {
    const before = filled[field]
    const untouched = before !== undefined && draft[field] === before.value
    const offer = suggestions[field]
    if (offer && (draft[field] === '' || untouched)) {
      if (draft[field] !== offer.value) next = { ...next, [field]: offer.value }
      nowFilled[field] = offer
    } else if (untouched) {
      next = { ...next, [field]: '' }
    }
  }
  return { draft: next, filled: nowFilled }
}

/** The suggestion still showing in a field, if the reader hasn't changed its value. */
export function stillFilled(draft: Record<Fillable, string>, filled: Filled, field: Fillable): Suggested | null {
  const value = filled[field]
  return value !== undefined && draft[field] === value.value ? value : null
}
