import { describe, expect, it } from 'vitest'
import { isbnFromBarcode, readIsbn } from './isbn'

describe('readIsbn', () => {
  it('reads an ISBN written any usual way, as its digits only', () => {
    expect(readIsbn('9780306406157')).toBe('9780306406157')
    expect(readIsbn('978-0-306-40615-7')).toBe('9780306406157')
    expect(readIsbn('ISBN-13: 978 0 306 40615 7')).toBe('9780306406157')
    expect(readIsbn('  isbn 0-306-40615-2  ')).toBe('0306406152')
    expect(readIsbn('0-8044-2957-x')).toBe('080442957X')
  })

  it('reads Arabic-Indic and Persian digits, and the Arabic label', () => {
    expect(readIsbn('ردمك: ٩٧٨-٠-٣٠٦-٤٠٦١٥-٧')).toBe('9780306406157')
    expect(readIsbn('ردمك ۹۷۸۰۳۰۶۴۰۶۱۵۷')).toBe('9780306406157')
  })

  it('refuses what the API would refuse', () => {
    for (const wrong of [
      '',
      '   ',
      'ISBN',
      '978-0-306-40615-6', // wrong check digit
      '0-306-40615-3', // wrong check digit
      '978X306406157', // X only ends an ISBN-10
      '978030640615X', // never an ISBN-13
      '12345',
      '97803064061577',
      '978.0.306.40615.7',
      '9'.repeat(41),
      '<script>9780306406157</script>',
    ]) {
      expect(readIsbn(wrong), wrong).toBeNull()
    }
  })
})

describe('isbnFromBarcode', () => {
  it('takes the EAN-13 on a book: 978 or 979, with a right check digit', () => {
    expect(isbnFromBarcode('9780306406157')).toBe('9780306406157')
    expect(isbnFromBarcode('9791090636071')).toBe('9791090636071')
  })

  it("refuses every other barcode, such as a shop's own, a wrong read, or a number that is not 13 digits", () => {
    for (const other of [
      '5012345678900',
      '9780306406156',
      '0306406152',
      '97803064061',
      '978030640615X',
      '',
      ' 9780306406157',
    ]) {
      expect(isbnFromBarcode(other), other).toBeNull()
    }
  })
})
