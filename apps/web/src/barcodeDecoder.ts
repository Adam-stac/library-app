/** Reads whatever barcodes are in the camera's current picture, as the text each one holds. */
export type Decoder = (video: HTMLVideoElement) => Promise<string[]>

type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * The browser's own barcode reader where it has one that reads EAN-13 (Chrome on Android and some desktops), which is
 * quick and adds nothing to the page. Elsewhere, the reader that ships with the app (ADR 0010), loaded only now so
 * nobody who doesn't scan downloads it. Either way the picture stays on the device.
 */
export async function loadDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? []
      if (formats.includes('ean_13')) {
        const detector = new Native({ formats: ['ean_13'] })
        return async (video) => (await detector.detect(video)).map((code) => code.rawValue)
      }
    } catch {
      // The browser's reader isn't usable after all: the bundled one below is
    }
  }
  const { createDecoder } = await import('./zxingDecoder')
  return createDecoder()
}
