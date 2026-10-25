import { describe, expect, it } from 'vitest'
import { indexLetter, searchKey, sortKey } from './indexLetter'

describe('index letters', () => {
  it('folds letters as the database does', () => {
    expect(searchKey('  أَبُو   هُرَيْرَةَ ')).toBe('ابو هريره')
    expect(searchKey('Ḥadīth')).toBe('hadith')
    expect(searchKey('ʿAqīdah')).toBe('aqidah')
    expect(searchKey('مـــوطأ ٢')).toBe('موطا 2')
  })

  it('skips a leading article, but keeps ابن and أبو', () => {
    expect(sortKey('البخاري')).toBe('بخاري')
    expect(sortKey('al-Nawawi')).toBe('nawawi')
    expect(sortKey('The Muwatta')).toBe('muwatta')
    expect(sortKey('ابن حجر')).toBe('ابن حجر')
    expect(sortKey('أبو داود')).toBe('ابو داود')
  })

  it('files a name under the first letter of its sort key', () => {
    expect(indexLetter('البخاري')).toBe('ب')
    expect(indexLetter('ابن حجر العسقلاني')).toBe('ا')
    expect(indexLetter('إسحاق')).toBe('ا')
    expect(indexLetter('al-Nawawi')).toBe('N')
    expect(indexLetter('Ibn Ḥajar')).toBe('I')
    expect(indexLetter('ʿAbd al-Razzāq')).toBe('A')
    expect(indexLetter('Ẓāhirī')).toBe('Z')
    expect(indexLetter('(Anonymous)')).toBe('A')
    expect(indexLetter('...')).toBe('')
  })
})
