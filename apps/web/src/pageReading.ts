/**
 * Reading a book's cover or title page from a photo (ADR 0011). The photo is redrawn here, in the browser, before it
 * goes anywhere: at most 2,000 pixels on its long side, as a plain JPEG, which leaves behind the hidden details a
 * phone stores in it (where and when it was taken, and the phone). Only that picture goes to our server, which has it
 * read by Google Cloud Vision and keeps nothing.
 */

/** The longest side of the picture that is sent; enough for print of any size on a page */
export const LONGEST_SIDE = 2000

/** What the server found on the page: every field may be missing */
export type PageFields = {
  title: string | null
  authors: string[]
  authorDeathHijri: number | null
  muhaqqiq: string | null
  publisher: string | null
  publicationPlace: string | null
  edition: string | null
  publishedHijri: number | null
  publishedCe: number | null
  isbn: string | null
}

export type PageReading = { fields: PageFields; lines: string[] }

export type PageReadingStatus = { enabled: boolean; leftToday: number; leftThisMonth: number; paused: boolean }

function text(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null
}

function whole(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

/** The server's answer, checked: anything not of the expected shape is left out, never trusted */
export function pageReading(value: unknown): PageReading | null {
  if (typeof value !== 'object' || value === null) return null
  const answer = value as { fields?: unknown; lines?: unknown }
  const f = (typeof answer.fields === 'object' && answer.fields !== null ? answer.fields : {}) as Record<
    string,
    unknown
  >
  const lines = Array.isArray(answer.lines)
    ? answer.lines.map((line) => text(line)).filter((line): line is string => line !== null).slice(0, 200)
    : []
  const authors = Array.isArray(f.authors)
    ? f.authors.map((name) => text(name, 300)).filter((name): name is string => name !== null).slice(0, 5)
    : []
  const isbn = text(f.isbn, 13)
  return {
    lines,
    fields: {
      title: text(f.title),
      authors,
      authorDeathHijri: whole(f.authorDeathHijri, 1, 1500),
      muhaqqiq: text(f.muhaqqiq, 300),
      publisher: text(f.publisher, 200),
      publicationPlace: text(f.publicationPlace, 200),
      edition: text(f.edition, 200),
      publishedHijri: whole(f.publishedHijri, 1, 1500),
      publishedCe: whole(f.publishedCe, 1, 2100),
      isbn: isbn && /^[0-9]{9}[0-9X]$|^97[89][0-9]{10}$/.test(isbn) ? isbn : null,
    },
  }
}

/** «الطبعة الأولى» → 1 … «العاشرة» → 10; an edition the form's number field can't hold gives null */
const ORDINALS: [RegExp, number][] = [
  [/الأولى|الاولى|الأولي/, 1],
  [/الثانية/, 2],
  [/الثالثة/, 3],
  [/الرابعة/, 4],
  [/الخامسة/, 5],
  [/السادسة/, 6],
  [/السابعة/, 7],
  [/الثامنة/, 8],
  [/التاسعة/, 9],
  [/العاشرة/, 10],
]

export function editionNumber(edition: string | null): number | null {
  if (!edition) return null
  const western = edition.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const digits = /(?:الطبعة|طبعة|ط)\s*\.?\s*([0-9]{1,3})(?![0-9])/.exec(western)
  if (digits) return Number(digits[1])
  for (const [pattern, number] of ORDINALS) if (pattern.test(edition)) return number
  return null
}

/**
 * The photo, redrawn: at most {@link LONGEST_SIDE} pixels on its long side, re-encoded as a JPEG. Drawing it on a
 * canvas and saving the canvas keeps only the picture: the file's hidden details are not copied.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    context.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/jpeg', 0.85),
    )
  } finally {
    bitmap.close()
  }
}

/**
 * The name a scholar is known by, from the name printed on a page: what follows «الشهير ب…» or «المعروف ب…»
 * («الشهير بالحطاب» → «الحطاب»), or else the last word, as Arabic names end with the name people use.
 */
export function knownAs(printed: string): string {
  const name = printed.replace(/[()[\]«»"]/g, ' ').replace(/\s+/g, ' ').trim()
  const after = /(?:الشهير|المشهور|المعروف)\s+ب(\S+(?:\s+\S+)?)/.exec(name)
  if (after) return after[1].trim()
  const words = name.split(' ')
  return words[words.length - 1] ?? name
}
