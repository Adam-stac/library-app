import { describe, expect, it } from 'vitest'
import { ceYearsOf, parseYear } from './hijri'

describe('ceYearsOf', () => {
  // Reference values from the Python `convertdate` library (tabular Islamic calendar; Julian before 1582)
  const reference: [number, number, number][] = [
    [1, 622, 623], [2, 623, 624], [40, 660, 661], [132, 749, 750], [194, 809, 810], [256, 869, 870],
    [310, 922, 923], [505, 1111, 1112], [656, 1258, 1258], [774, 1372, 1373], [852, 1448, 1449],
    [911, 1505, 1506], [990, 1582, 1583], [1000, 1591, 1592], [1206, 1791, 1792], [1343, 1924, 1925],
    [1429, 2008, 2008], [1446, 2024, 2025], [1447, 2025, 2026], [1500, 2076, 2077],
  ]

  it.each(reference)('%i AH overlaps %i–%i CE', (hijri, from, to) => {
    expect(ceYearsOf(hijri)).toEqual([from, to])
  })

  it('finds the 48 Hijri years from 1 to 1500 that fall inside a single CE year', () => {
    let single = 0
    for (let year = 1; year <= 1500; year++) {
      const [from, to] = ceYearsOf(year)
      expect(to - from).toBeLessThanOrEqual(1)
      if (from === to) single++
    }
    expect(single).toBe(48)
  })

  it('handles years before the Hijra, with no year 0 in either calendar', () => {
    expect(ceYearsOf(-1)).toEqual([621, 622])
    expect(ceYearsOf(-51)).toEqual([573, 574]) // around when Abu Bakr was born
    expect(ceYearsOf(-1037)).toEqual([-385, -384]) // 385–384 BCE: Aristotle's time
  })
})

describe('parseYear', () => {
  it('reads Western, Arabic-Indic and Persian digits', () => {
    expect(parseYear('256')).toBe(256)
    expect(parseYear(' ٢٥٦ ')).toBe(256)
    expect(parseYear('۲۵۶')).toBe(256)
  })

  it('treats empty as no year, and refuses anything else', () => {
    expect(parseYear('  ')).toBeNull()
    for (const text of ['0', '-5', '2.5', '25a', '12345', 'abc', '٢٥٦هـ']) {
      expect(parseYear(text)).toBe('invalid')
    }
  })
})
