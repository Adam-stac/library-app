import { describe, expect, it } from 'vitest'
import { fillIn, NO_SUGGESTIONS, stillFilled, type Suggestions } from './suggestions'

const EMPTY = { publisher: '', publicationPlace: '', language: '', other: 'kept' }
const FROM_YOUR_BOOKS: Suggestions = {
  publisher: { value: 'دار الغوثاني', from: 'yourBooks', country: null },
  publicationPlace: { value: 'دمشق', from: 'yourBooks', country: null },
  language: { value: 'ar', from: 'yourBooks', country: null },
}

describe('fillIn', () => {
  it('fills empty fields and says what it filled', () => {
    const { draft, filled } = fillIn(EMPTY, {}, FROM_YOUR_BOOKS)

    expect(draft).toEqual({ publisher: 'دار الغوثاني', publicationPlace: 'دمشق', language: 'ar', other: 'kept' })
    expect(Object.keys(filled)).toEqual(['publisher', 'publicationPlace', 'language'])
  })

  it('never replaces what you typed (fillingNeverReplacesWhatYouTyped)', () => {
    const typed = { ...EMPTY, publisher: 'دار الفكر', language: 'en' }

    const { draft, filled } = fillIn(typed, {}, FROM_YOUR_BOOKS)

    expect(draft.publisher).toBe('دار الفكر')
    expect(draft.language).toBe('en')
    expect(draft.publicationPlace).toBe('دمشق')
    expect(filled).toEqual({ publicationPlace: FROM_YOUR_BOOKS.publicationPlace })
  })

  it('replaces its own earlier suggestion when the ISBN changes, but not one you have since edited', () => {
    const first = fillIn(EMPTY, {}, FROM_YOUR_BOOKS)
    const edited = { ...first.draft, publicationPlace: 'بيروت' }
    const other: Suggestions = {
      publisher: { value: 'دار القلم', from: 'yourBooks', country: null },
      publicationPlace: { value: 'دمشق', from: 'yourBooks', country: null },
      language: null,
    }

    const { draft, filled } = fillIn(edited, first.filled, other)

    expect(draft.publisher).toBe('دار القلم')
    expect(draft.publicationPlace).toBe('بيروت')
    expect(draft.language).toBe('') // the earlier suggestion no longer applies, so it's taken back out
    expect(Object.keys(filled)).toEqual(['publisher'])
  })

  it('takes every untouched suggestion back out when the ISBN is cleared', () => {
    const first = fillIn(EMPTY, {}, FROM_YOUR_BOOKS)

    const { draft, filled } = fillIn(first.draft, first.filled, NO_SUGGESTIONS)

    expect(draft).toEqual(EMPTY)
    expect(filled).toEqual({})
  })

  it('returns the same draft when there is nothing to change', () => {
    expect(fillIn(EMPTY, {}, NO_SUGGESTIONS).draft).toBe(EMPTY)
  })
})

describe('stillFilled', () => {
  it('is the suggestion until the value is edited', () => {
    const { draft, filled } = fillIn(EMPTY, {}, FROM_YOUR_BOOKS)

    expect(stillFilled(draft, filled, 'publisher')).toEqual(FROM_YOUR_BOOKS.publisher)
    expect(stillFilled({ ...draft, publisher: 'دار الغوثاني ' }, filled, 'publisher')).toBeNull()
  })
})
