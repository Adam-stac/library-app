import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Patterns for each digit of an EAN-13: left side in two styles (L and G), right side in one (R)
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
// Which style each of the six left digits uses, set by the first digit
const FIRST = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** The bars of an EAN-13 as 95 modules of 1 (dark) and 0 (light). */
export function ean13Modules(digits: string): string {
  if (!/^[0-9]{13}$/.test(digits)) throw new Error('an EAN-13 has 13 digits')
  const style = FIRST[Number(digits[0])]
  let modules = '101'
  for (let i = 0; i < 6; i++) modules += (style[i] === 'L' ? L : G)[Number(digits[i + 1])]
  modules += '01010'
  for (let i = 7; i < 13; i++) modules += R[Number(digits[i])]
  return `${modules}101`
}

const WIDTH = 640
const HEIGHT = 480

/** One greyscale picture of the barcode, held up in the middle of the frame. */
export function barcodePicture(digits: string): Uint8Array {
  const modules = ean13Modules(digits)
  const moduleWidth = 4
  const left = Math.floor((WIDTH - modules.length * moduleWidth) / 2)
  const top = 120
  const bottom = 360
  const luma = new Uint8Array(WIDTH * HEIGHT).fill(235)
  for (let m = 0; m < modules.length; m++) {
    if (modules[m] !== '1') continue
    for (let y = top; y < bottom; y++) {
      for (let x = left + m * moduleWidth; x < left + (m + 1) * moduleWidth; x++) luma[y * WIDTH + x] = 20
    }
  }
  return luma
}

/**
 * A short video file for Chromium's fake camera (`--use-file-for-fake-video-capture`) that shows only this barcode, written
 * to a temporary folder when a test needs it, so no video is kept in the repository. Returns its path.
 */
export function barcodeVideo(digits: string, name = 'barcode'): string {
  const luma = barcodePicture(digits)
  const chroma = new Uint8Array((WIDTH / 2) * (HEIGHT / 2)).fill(128)
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F10:1 Ip A1:1 C420jpeg\n`)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma])
  const folder = join(tmpdir(), 'khizana-e2e')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `${name}-${digits}.y4m`)
  writeFileSync(file, Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]))
  return file
}
