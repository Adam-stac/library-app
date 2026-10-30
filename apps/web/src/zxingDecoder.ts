import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  EAN13Reader,
  HybridBinarizer,
  RGBLuminanceSource,
} from '@zxing/library'
import type { Decoder } from './barcodeDecoder'

/**
 * The part of the picture that is read: the middle, where the guide line is and where a book is held. Reading it at
 * the camera's full resolution, rather than shrinking the whole picture, keeps the thin bars of a barcode held at
 * arm's length sharp enough to read, and is quicker.
 */
const MIDDLE_WIDTH = 0.8
const MIDDLE_HEIGHT = 0.6
/** Larger cameras are read at this width, so one look never takes long on a slow phone. */
const MAX_WIDTH = 1600

/**
 * Reads EAN-13 barcodes from the camera's picture with code that ships with the app (ADR 0010). It is loaded only
 * when someone presses Scan, and only on browsers that can't read barcodes themselves. The picture is drawn onto a
 * canvas in memory and read there; it is never sent anywhere.
 */
export function createDecoder(): Decoder {
  // The EAN-13 reader on its own: a book's barcode is always EAN-13, and unlike the general reader it doesn't write a
  // warning to the console for every picture with no barcode in it
  const reader = new EAN13Reader()
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    [DecodeHintType.TRY_HARDER, true],
  ])
  const canvas = document.createElement('canvas')

  return async (video) => {
    if (!video.videoWidth || !video.videoHeight) return []
    const sourceWidth = Math.round(video.videoWidth * MIDDLE_WIDTH)
    const sourceHeight = Math.round(video.videoHeight * MIDDLE_HEIGHT)
    const scale = Math.min(1, MAX_WIDTH / sourceWidth)
    const width = Math.round(sourceWidth * scale)
    const height = Math.round(sourceHeight * scale)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return []
    context.drawImage(
      video,
      Math.round((video.videoWidth - sourceWidth) / 2),
      Math.round((video.videoHeight - sourceHeight) / 2),
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    )
    const { data } = context.getImageData(0, 0, width, height)

    const grey = new Uint8ClampedArray(width * height)
    for (let i = 0; i < grey.length; i++) {
      grey[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
    }
    try {
      const picture = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(grey, width, height)))
      return [reader.decode(picture, hints).getText()]
    } catch {
      // Nothing readable in this picture is the usual case, and the reader reports it as an error. Its error types
      // don't survive minifying reliably, so any failure here means "not in this one": the next picture is tried
      return []
    }
  }
}
