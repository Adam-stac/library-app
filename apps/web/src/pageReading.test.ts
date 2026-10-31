import { afterEach, describe, expect, it, vi } from 'vitest'
import { editionNumber, knownAs, LONGEST_SIDE, pageReading, preparePhoto } from './pageReading'

describe('reading a page from a photo (ADR 0011)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('redraws the photo at most 2,000 pixels on its long side, as a fresh JPEG (thePhotoIsReEncodedWithoutItsMetadata)', async () => {
    const closed = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4032, height: 3024, close: closed })))
    const drawn = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: drawn,
    } as unknown as CanvasRenderingContext2D)
    let saved: { width: number; height: number; type: string | undefined } | null = null
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      saved = { width: this.width, height: this.height, type }
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })

    const phoneFile = new File(['exif and pixels'], 'IMG_0001.HEIC', { type: 'image/heic' })
    const sent = await preparePhoto(phoneFile)

    // Only what was drawn on the canvas is sent: a new file, not the phone's, so none of its hidden details
    expect(sent).not.toBe(phoneFile)
    expect(sent.type).toBe('image/jpeg')
    expect(saved).toEqual({ width: LONGEST_SIDE, height: 1500, type: 'image/jpeg' })
    expect(drawn).toHaveBeenCalledOnce()
    expect(closed).toHaveBeenCalledOnce()
  })

  it('keeps a small photo at its own size', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 900, close: () => {} })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D)
    const sizes: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      sizes.push(this.width, this.height)
      callback(new Blob(['x'], { type: 'image/jpeg' }))
    })

    await preparePhoto(new Blob(['x']))

    expect(sizes).toEqual([1200, 900])
  })

  it("checks the server's answer and leaves out anything of the wrong shape", () => {
    expect(pageReading(null)).toBeNull()
    expect(
      pageReading({
        fields: { title: 'فتح الباري', authors: ['ابن حجر', 7, ''], publishedHijri: 99999, isbn: 'not-an-isbn' },
        lines: ['فتح الباري', 42, 'x'.repeat(600)],
      }),
    ).toEqual({
      lines: ['فتح الباري'],
      fields: {
        title: 'فتح الباري',
        authors: ['ابن حجر'],
        authorDeathHijri: null,
        muhaqqiq: null,
        publisher: null,
        publicationPlace: null,
        edition: null,
        publishedHijri: null,
        publishedCe: null,
        isbn: null,
      },
    })
  })

  it('reads the edition number from the wording', () => {
    expect(editionNumber('الطبعة الأولى ١٤٣٢هـ - ٢٠١١م')).toBe(1)
    expect(editionNumber('الطبعة الثالثة')).toBe(3)
    expect(editionNumber('ط ٢')).toBe(2)
    expect(editionNumber('طبعة جديدة مقابلة على عدة نسخ خطية')).toBeNull()
    expect(editionNumber(null)).toBeNull()
  })

  it('finds the name a scholar is known by', () => {
    expect(knownAs('العلامة شمس الدين محمد بن محمد الرعيني المالكي الشهير بالحطاب')).toBe('الحطاب')
    expect(knownAs('الحافظ أحمد بن علي بن حجر العسقلاني')).toBe('العسقلاني')
    expect(knownAs('محمد بن إسماعيل البخاري المعروف بالإمام البخاري')).toBe('الإمام البخاري')
  })
})
