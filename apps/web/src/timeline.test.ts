import { describe, expect, it } from 'vitest'
import {
  fitLabels,
  fraction,
  hijriOfCe,
  hijriToday,
  labelBox,
  magnify,
  nearest,
  placeAuthors,
  step,
  type TimelineAuthor,
} from './timeline'

const author = (id: string, hijri: number | null, ce: number | null = null): TimelineAuthor => ({
  id,
  nameAr: null,
  nameEn: id,
  deathHijri: hijri,
  deathCe: ce,
  approximate: false,
  books: 0,
  works: 0,
  titles: [],
  science: null,
})

describe('the timeline', () => {
  it('ends at today’s Hijri year, from the device’s date', () => {
    expect(hijriToday(new Date('2026-10-29T12:00:00Z'))).toBe(1448)
    expect(hijriToday(new Date('2026-06-01T12:00:00Z'))).toBe(1447)
  })

  it('places a death known only in CE at the Hijri year it falls in', () => {
    expect(hijriOfCe(1999)).toBe(1420)
    expect(hijriOfCe(870)).toBe(256)
  })

  it('puts authors in order of death, leaving out any after today', () => {
    const placed = placeAuthors([author('b', 676), author('a', 256), author('c', null, 1999), author('later', 1500)], 1448)
    expect(placed.map((a) => [a.id, a.year])).toEqual([
      ['a', 256],
      ['b', 676],
      ['c', 1420],
    ])
  })

  it('runs from the first year of the Hijra (0) to today (1)', () => {
    expect(fraction(1, 1448)).toBe(0)
    expect(fraction(1448, 1448)).toBe(1)
  })

  it('spreads the ruler under the pointer, and leaves the rest where it was', () => {
    const width = 1000
    // Two points close together near the pointer move further apart
    const near = [0.5, 0.51].map((p) => magnify(p, 0.5, width))
    expect(near[1] - near[0]).toBeGreaterThan(0.01)
    // Beyond the magnifier's reach, nothing moves
    expect(magnify(0.9, 0.5, width)).toBe(0.9)
    // At rest (no pointer), nothing moves
    expect(magnify(0.3, null, width)).toBe(0.3)
  })

  it('settles on the nearest author, and the keys reach every one of them', () => {
    const placed = placeAuthors([author('a', 256), author('b', 261), author('c', 676)], 1448)
    expect(nearest(placed, fraction(260, 1448), 1448, null, 1000)).toBe(1)
    expect(step(placed, 0, 1)).toBe(1)
    expect(step(placed, 2, 1)).toBe(2)
    expect(step(placed, 0, -1)).toBe(0)
  })

  it('keeps only labels that don’t touch one already kept, most important first', () => {
    const labels = [
      { key: 'today', at: 1, width: 100 },
      { key: '1400', at: 0.97, width: 60 },
      { key: '1', at: 0, width: 40 },
    ]
    expect(fitLabels(labels, 1000).map((l) => l.key)).toEqual(['today', '1'])
  })

  it('hangs labels near either end inwards, so none runs off the ruler', () => {
    expect(labelBox(0, 100, 1000)).toEqual([0, 100])
    expect(labelBox(1, 100, 1000)).toEqual([900, 1000])
    expect(labelBox(0.5, 100, 1000)).toEqual([450, 550])
  })
})
