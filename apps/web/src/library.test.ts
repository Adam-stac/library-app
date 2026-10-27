import { describe, expect, it } from 'vitest'
import i18n from './i18n'
import { decimal, errorMessage, isArabic, wholeNumber } from './library'

describe('numbers typed in forms', () => {
  it('reads whole numbers, in any digits, within a range', () => {
    expect(wholeNumber(' ١٢ ', 20)).toBe(12)
    expect(wholeNumber('۳', 20)).toBe(3)
    expect(wholeNumber('', 20)).toBeNull()
    expect(wholeNumber('0', 20)).toBe('invalid')
    expect(wholeNumber('21', 20)).toBe('invalid')
    expect(wholeNumber('1.5', 20)).toBe('invalid')
  })

  it('reads decimals, with the Arabic decimal separator and a minus sign', () => {
    expect(decimal('21.4225')).toBe(21.4225)
    expect(decimal('٤١٫٠٠٨٢')).toBe(41.0082)
    expect(decimal('-33.86')).toBe(-33.86)
    expect(decimal('−0.5')).toBe(-0.5)
    expect(decimal('')).toBeNull()
    expect(decimal('12°')).toBe('invalid')
    expect(decimal('1e3')).toBe('invalid')
  })
})

describe('isArabic', () => {
  it('tells Arabic letters from Latin ones', () => {
    expect(isArabic('مكة')).toBe(true)
    expect(isArabic('Makkah')).toBe(false)
  })
})

describe('errorMessage', () => {
  it('says what still uses a record, in either language', async () => {
    await i18n.changeLanguage('en')
    expect(errorMessage(i18n.t, 'en', 'in_use', { usedBy: { authors: 1, works: 2 } })).toBe(
      "This is still used by 1 author and 2 books, so it can't be deleted. Remove it from those first.",
    )
    await i18n.changeLanguage('ar')
    expect(errorMessage(i18n.t, 'ar', 'in_use', { usedBy: { works: 2 } })).toBe(
      'ما زال يستعمله كتابان، فلا يمكن حذفه. أزله منها أولًا.',
    )
    await i18n.changeLanguage('en')
  })

  it('falls back to the general message for a kind it does not know', () => {
    expect(errorMessage(i18n.t, 'en', 'in_use', { usedBy: { comets: 2 } })).toBe(
      "This is still used elsewhere in your library, so it can't be deleted. Remove it from those records first.",
    )
    expect(errorMessage(i18n.t, 'en', 'no_such_code')).toBe('Something went wrong. Please try again.')
  })
})
