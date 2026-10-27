import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import Icon from './Icon'

/**
 * Who is signed in, as a button that opens a small menu: the settings, and signing out. A disclosure (a button that
 * shows and hides what follows it) rather than an ARIA menu, so links and buttons inside work as they do anywhere
 * else. It closes with Escape (focus goes back to the button), a click elsewhere, moving focus out of it, or going to
 * another page.
 *
 * Wide screens: at the foot of the sidebar, showing the email address, and opening upwards above the sidebar's
 * foot (positioned by it, so the menu covers nothing else there). Phones: just the initial, in the top bar, opening
 * downwards.
 */
export default function AccountMenu({ email }: { email: string }) {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The page the menu was opened on: going to another page closes it
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const setOpen = (value: boolean) => setOpenOn(value ? location.pathname : null)
  const [signingOut, setSigningOut] = useState(false)
  const [failed, setFailed] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpenOn(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  async function onSignOut() {
    setSigningOut(true)
    setFailed(false)
    const done = await signOut()
    setSigningOut(false)
    if (done) navigate('/', { replace: true })
    else setFailed(true)
  }

  return (
    <div
      ref={container}
      className="relative lg:static"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          button.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className={`flex min-h-10 w-full items-center gap-3 rounded-lg p-1 text-start transition-colors duration-150 hover:bg-hover lg:px-2 lg:py-1.5 ${
          open ? 'bg-hover' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
        >
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="sr-only">{t('nav.yourAccount')}, </span>
        <bdi dir="ltr" className="sr-only min-w-0 flex-1 truncate text-sm font-medium lg:not-sr-only">
          {email}
        </bdi>
        <Icon name="upDown" className="hidden size-4 text-muted lg:block" />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute end-0 top-full z-20 mt-2 w-64 glass-panel rounded-xl border border-line p-1.5 shadow-menu lg:start-0 lg:end-auto lg:top-auto lg:bottom-full lg:mt-0 lg:mb-2 lg:w-full lg:min-w-56"
        >
          <p className="px-2.5 pt-2 pb-2.5 text-xs text-muted">
            {t('nav.signedInAs')}
            <bdi dir="ltr" className="mt-0.5 block truncate text-sm font-medium text-ink">
              {email}
            </bdi>
          </p>
          <div className="border-t border-line pt-1.5">
            <Link to="/settings" className={item}>
              <Icon name="settings" className="size-4 text-muted" />
              {t('nav.settings')}
            </Link>
            <button type="button" onClick={() => void onSignOut()} disabled={signingOut} className={item}>
              <Icon name="signOut" className="size-4 text-muted" />
              {t('nav.signOut')}
            </button>
          </div>
          {failed && (
            <p role="alert" className="px-2.5 pt-1 pb-2 text-sm text-danger">
              {t('errors.signOutFailed')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const item =
  'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm font-medium transition-colors duration-150 hover:bg-hover disabled:opacity-60'
