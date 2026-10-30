import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library'
import type { Decoder } from './barcodeDecoder'

/** Frames wider than this are scaled down first: a barcode held up to a camera is large, and speed matters. */
const MAX_WIDTH = 1024

/**
 * Reads EAN-13 barcodes from the camera's picture with code that ships with the app (ADR 0010). It is loaded only
 * when someone presses Scan, and only on browsers that can't read barcodes themselves. The picture is drawn onto a
 * canvas in memory and read there; it is never sent anywhere.
 */
export function createDecoder(): Decoder {
  const reader = new MultiFormatReader()
  reader.setHints(
    new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
      [DecodeHintType.TRY_HARDER, true],
    ]),
  )
  const canvas = document.createElement('canvas')

  return async (video) => {
    if (!video.videoWidth || !video.videoHeight) return []
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return []
    context.drawImage(video, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)

    const grey = new Uint8ClampedArray(width * height)
    for (let i = 0; i < grey.length; i++) {
      grey[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
    }
    try {
      const picture = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(grey, width, height)))
      return [reader.decodeWithState(picture).getText()]
    } catch {
      // Nothing readable in this picture is the usual case, and the reader reports it as an error. Its error types
      // don't survive minifying reliably, so any failure here means "not in this one": the next picture is tried
      return []
    }
  }
}
