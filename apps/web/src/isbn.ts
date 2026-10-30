/**
 * ISBNs as read from a book (typed, or scanned from its barcode). These are the same rules the API applies (see
 * PrintedNumbers.java), so a scan or a typed number is recognised here before anything is asked of the server; the
 * server still has the final say.
 */

/** Arabic-Indic (٠–٩) and Persian (۰–۹) digits become 0–9. */
export function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf))
}

/**
 * The digits of an ISBN-10 or ISBN-13 with a correct check digit (and a final X for an ISBN-10), from however it
 * is written: hyphens and spaces are ignored, and so is a leading "ISBN", "ISBN-13" or "ردمك". Null when it isn't
 * one, or is blank.
 */
export function readIsbn(text: string): string | null {
  if (text.length > 40) return null
  const cleaned = westernDigits(text.trim()).replace(/^(ISBN(-1[03])?|ردمك)\s*:?\s*/i, '')
  if (!/^[0-9][0-9 -]*[0-9Xx]?$/.test(cleaned)) return null
  const isbn = cleaned.replace(/[ -]/g, '').toUpperCase()
  if (isbn.length === 10) return isbn10IsRight(isbn) ? isbn : null
  if (isbn.length === 13) return /^[0-9]+$/.test(isbn) && isbn13IsRight(isbn) ? isbn : null
  return null
}

/**
 * The ISBN in a scanned barcode. A book's barcode is an EAN-13 that starts 978 or 979, with a correct check digit.
 * Any other barcode (a shop's own, a price add-on read on its own) is not an ISBN, and gives null.
 */
export function isbnFromBarcode(text: string): string | null {
  return /^97[89][0-9]{10}$/.test(text) && isbn13IsRight(text) ? text : null
}

function isbn10IsRight(isbn: string): boolean {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const c = isbn[i]
    if (c === 'X' && i !== 9) return false
    sum += (c === 'X' ? 10 : Number(c)) * (10 - i)
  }
  return sum % 11 === 0
}

function isbn13IsRight(isbn: string): boolean {
  let sum = 0
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3)
  return sum % 10 === 0
}
