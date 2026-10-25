import { afterEach, describe, expect, it } from 'vitest'
import { displayName, formatYear, lifeYears, otherName } from './authors'
import i18n from './i18n'

const year = (hijri: number | null, ce: number | null = null, approximate = false) => ({ hijri, ce, approximate })

describe('formatYear', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows the Hijri year with the CE years it overlaps, worked out when not typed', async () => {
    await i18n.changeLanguage('en')
    const t = i18n.t.bind(i18n)
    expect(formatYear(year(256), t, 'en')).toBe('256 AH (869–870 CE)')
    expect(formatYear(year(1429), t, 'en')).toBe('1429 AH (2008 CE)')
    expect(formatYear(year(256, 870), t, 'en')).toBe('256 AH (870 CE)')
    expect(formatYear(year(null, 870), t, 'en')).toBe('870 CE')
    expect(formatYear(year(-51, null, true), t, 'en')).toBe('c. 51 BH (573–574 CE)')
    expect(formatYear(year(null, -384), t, 'en')).toBe('384 BCE')
    expect(formatYear(year(-1037), t, 'en')).toBe('1037 BH (385–384 BCE)')
    expect(formatYear(year(null), t, 'en')).toBeNull()
  })

  it('uses Arabic-Indic digits and Arabic era marks in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const t = i18n.t.bind(i18n)
    expect(formatYear(year(256), t, 'ar')).toBe('٢٥٦هـ (٨٦٩–٨٧٠م)')
    expect(formatYear(year(1447), t, 'ar')).toBe('١٤٤٧هـ (٢٠٢٥–٢٠٢٦م)')
    expect(formatYear(year(-51, null, true), t, 'ar')).toBe('نحو ٥١ ق.هـ (٥٧٣–٥٧٤م)')
  })

  it('puts birth and death together', async () => {
    await i18n.changeLanguage('en')
    const t = i18n.t.bind(i18n)
    expect(lifeYears({ birth: year(194), death: year(256) }, t, 'en')).toBe(
      '194 AH (809–810 CE) – 256 AH (869–870 CE)',
    )
    expect(lifeYears({ birth: year(null), death: year(256) }, t, 'en')).toBe('Died 256 AH (869–870 CE)')
    expect(lifeYears({ birth: year(null), death: year(null) }, t, 'en')).toBeNull()
  })
})

describe('names', () => {
  it('shows the name in the page language first, falling back to the other', () => {
    const both = { nameAr: 'البخاري', nameEn: 'al-Bukhari' }
    expect(displayName(both, 'ar')).toBe('البخاري')
    expect(displayName(both, 'en')).toBe('al-Bukhari')
    expect(otherName(both, 'en')).toBe('البخاري')
    expect(displayName({ nameAr: 'الطبري', nameEn: null }, 'en')).toBe('الطبري')
    expect(otherName({ nameAr: 'الطبري', nameEn: null }, 'en')).toBeNull()
  })
})
