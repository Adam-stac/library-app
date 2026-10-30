import { type KeyboardEvent, useEffect, useState } from 'react'
import { type Placed, step } from './timeline'

/** Up to this many authors, every name is shown; beyond it, only the one you're on (they'd crowd each other out) */
export const ALL_NAMES_UP_TO = 12

/** What the timeline's two views (the ruler on a wide screen, the dial on a phone) share with the page */
export type TimelineViewProps = {
  placed: Placed[]
  now: number
  focus: number
  onFocus: (index: number) => void
  pins: number[]
  onPin: (index: number) => void
  onClear: () => void
}

/**
 * The width of an element, kept in step with the window. Returns a callback ref, so the element is measured
 * whenever it appears (such as once a page's data has loaded), not only when the component first draws.
 */
export function useWidth(fallback: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!element) return
    const measure = () => setWidth(element.getBoundingClientRect().width || fallback)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, fallback])
  return [setElement, width] as const
}

/** The keys the timeline answers to: along it (in reading direction), to either end, pin, and clear */
export function timelineKeys(
  event: KeyboardEvent,
  rtl: boolean,
  { placed, focus, onFocus, onPin, onClear }: TimelineViewProps,
) {
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'
  let next: number | null = null
  if (event.key === forward || event.key === 'ArrowUp') next = step(placed, focus, 1)
  else if (event.key === back || event.key === 'ArrowDown') next = step(placed, focus, -1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = placed.length - 1
  else if (event.key === 'Enter' || event.key === ' ') onPin(focus)
  else if (event.key === 'Escape') onClear()
  else return
  event.preventDefault()
  if (next !== null) onFocus(next)
}

/** Whether the screen is wide enough for the ruler (the sm breakpoint); a phone gets the dial */
export function useWide(): boolean {
  const query = '(min-width: 40rem)'
  const [wide, setWide] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const changed = () => setWide(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  return wide
}
