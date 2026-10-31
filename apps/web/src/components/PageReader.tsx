import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postImage } from '../api'
import { formatNumber } from '../authors'
import { errorMessage } from '../library'
import { type PageReading, pageReading, type PageReadingStatus, preparePhoto } from '../pageReading'
import { useLoad } from '../useLoad'
import Icon from './Icon'

/**
 * "Photograph the cover or title page" (ADR 0011): the first step of Add a book, when reading pages is set up. The
 * photo is redrawn in the browser (without its hidden location and time), sent to our server, and read by Google;
 * what was read comes back to the form, which fills only empty fields and asks the reader to confirm each one.
 * Without the feature (no key on the server) this shows nothing, and the form starts at the ISBN as before.
 */
export default function PageReader({
  onRead,
  frame,
}: {
  onRead: (reading: PageReading) => void
  /** The card it sits in, given what to show inside it */
  frame: (content: ReactNode) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [status, { reload }] = useLoad<PageReadingStatus>('/api/v1/page-readings/status')
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  if (status.status !== 'ok' || !status.data.enabled) return null
  const { leftToday, paused } = status.data
  const blocked = paused || leftToday === 0

  async function read(file: File) {
    setReading(true)
    setMessage(null)
    let photo: Blob
    try {
      photo = await preparePhoto(file)
    } catch {
      setReading(false)
      setMessage({ text: t('pageReading.notAPhoto'), problem: true })
      return
    }
    const result = await postImage<unknown>('/api/v1/page-readings', photo)
    setReading(false)
    reload()
    if (!result.ok) {
      const code = result.fieldErrors.image ?? result.code
      const text = t(`pageReading.errors.${code}`, { defaultValue: errorMessage(t, language, code) })
      setMessage({ text, problem: true })
      return
    }
    const answer = pageReading(result.data)
    if (!answer || answer.lines.length === 0) {
      setMessage({ text: t('pageReading.nothing'), problem: true })
      return
    }
    onRead(answer)
    setMessage({ text: t('pageReading.done'), problem: false })
  }

  return frame(
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // the same photo can be chosen again
          if (file) void read(file)
        }}
      />
      <p>
        <button
          type="button"
          className="btn btn-primary min-h-12"
          disabled={blocked || reading}
          aria-busy={reading}
          aria-describedby="page-reading-note"
          onClick={() => input.current?.click()}
        >
          <Icon name="camera" className="size-4.5" />
          {reading ? t('pageReading.reading') : t('pageReading.take')}
        </button>
      </p>
      <p id="page-reading-note" className="text-sm text-muted">
        {paused
          ? t('pageReading.paused')
          : leftToday === 0
            ? t('pageReading.noneLeftToday')
            : t('pageReading.note', { count: leftToday, number: formatNumber(leftToday, language) })}
      </p>
      <div aria-live="polite">
        {message && (
          <p
            role={message.problem ? 'alert' : undefined}
            className={message.problem ? 'text-sm text-danger' : 'text-sm'}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>,
  )
}
