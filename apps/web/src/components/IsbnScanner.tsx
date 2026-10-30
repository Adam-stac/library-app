import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadDecoder } from '../barcodeDecoder'
import { cameraCanBeUsed } from '../camera'
import { isbnFromBarcode } from '../isbn'
import Icon from './Icon'

type Status = 'starting' | 'looking' | 'notIsbn' | 'denied' | 'unavailable'

/** How often the picture is looked at for a barcode */
const LOOK_EVERY_MS = 250

/**
 * "Scan barcode": opens the camera in a dialog and reads the ISBN from the back of the book (ADR 0010). The picture
 * never leaves the device: it is read here, in the browser, and only the digits of an ISBN are handed on. The camera
 * is asked for only when the button is pressed, and is switched off when an ISBN is found, when the dialog is closed
 * or the tab is hidden, and when the page is left. Typing the ISBN always works, so a refused or missing camera is
 * never the end of the road.
 */
export default function IsbnScanner({ onFound }: { onFound: (isbn: string) => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('starting')
  const [announcement, setAnnouncement] = useState('')
  const titleId = useId()
  const statusId = useId()
  // The latest callback, without restarting the camera whenever the form around it re-renders
  const found = useRef(onFound)
  useEffect(() => {
    found.current = onFound
  })

  // The dialog follows `open`
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '') // test environments without <dialog> support
    } else if (!open && element.open) {
      if (typeof element.close === 'function') element.close()
      else element.removeAttribute('open')
    }
  }, [open])

  // The camera, for as long as the dialog is open
  useEffect(() => {
    if (!open) return
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      if (video.current) video.current.srcObject = null
    }

    async function run() {
      setStatus('starting')
      if (!cameraCanBeUsed()) {
        setStatus('unavailable')
        return
      }
      let media: MediaStream
      try {
        media = await navigator.mediaDevices.getUserMedia({
          // As sharp a picture as the camera gives (up to 1080p): the thin bars of a barcode need the pixels
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
      } catch (error) {
        const name = (error as { name?: string } | null)?.name
        if (!stopped) setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        return
      }
      if (stopped) {
        // Closed while the browser was asking: the camera must not stay on
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream = media
      // Keep focusing as the book moves, on cameras that can (most phones). Others ignore this, or refuse it, and
      // carry on as they are
      for (const track of media.getVideoTracks()) {
        void Promise.resolve(
          track.applyConstraints?.({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }),
        ).catch(() => {})
      }
      let decode: Awaited<ReturnType<typeof loadDecoder>>
      try {
        decode = await loadDecoder()
      } catch {
        stop()
        setStatus('unavailable')
        return
      }
      if (stopped || !video.current) return
      video.current.srcObject = media
      void Promise.resolve(video.current.play?.()).catch(() => {}) // a browser may start it by itself
      setStatus('looking')

      const look = async () => {
        if (stopped) return
        let seen: string[] = []
        if (video.current && video.current.readyState >= 2) {
          try {
            seen = await decode(video.current)
          } catch {
            // This picture couldn't be read; the next one is tried
          }
        }
        if (stopped) return
        const isbn = seen.map(isbnFromBarcode).find((code): code is string => code !== null)
        if (isbn) {
          stop()
          setOpen(false)
          setAnnouncement(t('books.isbn.found', { isbn }))
          found.current(isbn)
          return
        }
        if (seen.length > 0) setStatus('notIsbn')
        timer = setTimeout(() => void look(), LOOK_EVERY_MS)
      }
      void look()
    }

    // A hidden tab must not keep the camera on
    const onVisibility = () => {
      if (document.hidden) setOpen(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    void run()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [open, t])

  return (
    <>
      <button
        type="button"
        className="btn self-start"
        onClick={() => {
          setAnnouncement('')
          setOpen(true)
        }}
      >
        <Icon name="scan" />
        {t('books.isbn.scan')}
      </button>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={statusId}
        onClose={() => setOpen(false)}
        className="card m-auto w-[calc(100%-2rem)] max-w-lg p-5 text-ink backdrop:bg-black/40 sm:p-7"
      >
        <h2 id={titleId} className="section-title">
          {t('books.isbn.scanTitle')}
        </h2>
        <p className="mt-2 text-muted">{t('books.isbn.scanHint')}</p>
        {open && (
          <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
            <video ref={video} muted playsInline aria-hidden="true" className="aspect-[4/3] w-full object-cover" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[10%] top-1/2 h-0.5 -translate-y-1/2 bg-white/70"
            />
          </div>
        )}
        <p id={statusId} role="status" className="mt-3 min-h-6 text-sm text-muted">
          {t(`books.isbn.status.${status}`)}
        </p>
        <div className="mt-5 flex justify-end">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the way out is the first thing a keyboard reaches */}
          <button type="button" className="btn btn-primary" autoFocus onClick={() => setOpen(false)}>
            {t('books.isbn.typeInstead')}
          </button>
        </div>
      </dialog>
    </>
  )
}
