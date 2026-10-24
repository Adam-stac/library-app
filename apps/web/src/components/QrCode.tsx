import QRCode from 'qrcode'
import { useMemo } from 'react'

/**
 * Draws a QR code as plain SVG shapes: no images, data: URLs or innerHTML, so it works under our strict
 * Content-Security-Policy. Always black on white, which phone cameras read most reliably.
 */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const modules = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules
    const margin = 4
    let d = ''
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`
      }
    }
    return { size: modules.size + margin * 2, path: d }
  }, [text])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="size-52 rounded-lg border border-stone-300"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
