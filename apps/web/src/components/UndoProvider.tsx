import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'
import { errorMessage } from '../library'
import { UndoContext, type UndoOffer } from '../undo'
import Icon from './Icon'

/** Long enough to read the line and reach the button; it waits while the pointer or focus is on it */
export const UNDO_SECONDS = 10

type Shown = UndoOffer & { round: number; state: 'offered' | 'undoing' | 'undone' | 'failed'; error?: string }

/**
 * Deleting a book or a benefit happens at once, then says so here with Undo, the way mail apps do: no question
 * first, and a slip costs one tap to put right. The bin keeps it for 30 days besides, so the few seconds here are
 * never the only chance (WCAG 2.2.1). The line is read out politely; focus stays where it was.
 */
export default function UndoProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null)
  const offer = useCallback(
    (next: UndoOffer) => setShown((last) => ({ ...next, round: (last?.round ?? 0) + 1, state: 'offered' })),
    [],
  )

  return (
    <UndoContext.Provider value={offer}>
      {children}
      <UndoToast shown={shown} onChange={setShown} />
    </UndoContext.Provider>
  )
}

function UndoToast({ shown, onChange }: { shown: Shown | null; onChange: (shown: Shown | null) => void }) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [held, setHeld] = useState(false)
  const close = useCallback(() => onChange(null), [onChange])

  useEffect(() => {
    if (!shown || held || shown.state === 'undoing') return
    const timer = setTimeout(close, (shown.state === 'offered' ? UNDO_SECONDS : 5) * 1000)
    return () => clearTimeout(timer)
  }, [shown, held, close])

  async function undo(offer: Shown) {
    onChange({ ...offer, state: 'undoing' })
    const result = await postJson(`/api/v1/bin/${encodeURIComponent(offer.id)}/restore`, undefined, { csrf: true })
    if (result.ok) {
      onChange({ ...offer, state: 'undone' })
      offer.onUndone?.()
      if (offer.openAfter) navigate(offer.openAfter)
    } else if (result.status === 401) {
      close()
      void refresh()
    } else {
      onChange({ ...offer, state: 'failed', error: errorMessage(t, i18n.language, result.code) })
    }
  }

  const text = !shown
    ? ''
    : shown.state === 'undone'
      ? t('bin.putBack')
      : shown.state === 'failed'
        ? (shown.error ?? '')
        : shown.message

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:inset-x-auto lg:end-8 lg:bottom-8"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false)
      }}
    >
      <div
        className={
          shown
            ? 'toast pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-panel bg-chip py-2 ps-5 pe-2 text-on-chip shadow-float'
            : 'sr-only'
        }
      >
        {/* Always in the page, so screen readers hear each new line as it appears */}
        <p aria-live="polite" className="min-w-0 flex-1 py-2 text-sm">
          {text}
        </p>
        {shown && (shown.state === 'offered' || shown.state === 'undoing') && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:opacity-80"
            aria-busy={shown.state === 'undoing' || undefined}
            disabled={shown.state === 'undoing'}
            onClick={() => void undo(shown)}
          >
            <Icon name="undo" className="size-4" />
            {t('bin.undo')}
          </button>
        )}
        {shown?.state === 'failed' && (
          <Link
            to="/bin"
            onClick={close}
            className="min-h-11 content-center rounded-full px-3 text-sm font-semibold underline"
          >
            {t('bin.open')}
          </Link>
        )}
        {shown && (
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-full hover:opacity-80"
            aria-label={t('bin.dismiss')}
            onClick={close}
          >
            <Icon name="close" className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
