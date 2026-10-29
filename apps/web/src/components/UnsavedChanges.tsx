import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

/**
 * While a form has changes not yet saved (`when`), leaving asks first. Closing the tab or reloading gets the
 * browser's own question; following a link in the app (the menu, Cancel, the back link) gets this dialog, where
 * "Keep editing" is the default. The browser's Back button can't be asked about without a data router (ADR 0009);
 * the browser's question still covers leaving the site.
 */
export default function UnsavedChanges({ when }: { when: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const [leavingTo, setLeavingTo] = useState<string | null>(null)
  const titleId = useId()
  const textId = useId()

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '' // older browsers need this to ask
    }
    // Before the app's own link handling (capture), which then sees the click was handled and stays put
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return // a new tab or window
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const to = `${url.pathname}${url.search}${url.hash}`
      if (to === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
      event.preventDefault()
      setLeavingTo(to)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [when])

  useEffect(() => {
    const element = dialog.current
    if (!leavingTo || !element || element.open) return
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '') // test environments without <dialog> support
  }, [leavingTo])

  function stay() {
    if (typeof dialog.current?.close === 'function') dialog.current.close()
    else dialog.current?.removeAttribute('open')
    setLeavingTo(null)
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={() => setLeavingTo(null)}
      className="card m-auto w-[calc(100%-2rem)] max-w-md p-7 text-ink backdrop:bg-black/40"
    >
      <h2 id={titleId} className="section-title">
        {t('common.unsavedTitle')}
      </h2>
      <p id={textId} className="mt-2 text-muted">
        {t('common.unsavedText')}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const to = leavingTo
            stay()
            if (to) navigate(to)
          }}
        >
          {t('common.leave')}
        </button>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the safe choice, focused as the dialog opens */}
        <button type="button" className="btn btn-primary" autoFocus onClick={stay}>
          {t('common.stay')}
        </button>
      </div>
    </dialog>
  )
}
