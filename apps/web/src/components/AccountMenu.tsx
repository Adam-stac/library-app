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
 * Wide screens: the initial at the foot of the rail, opening beside it. Phones: the initial, in the top bar, opening
 * downwards. The email address is in the button's name, and shown at the top of the menu.
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
      className="relative"
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
        className={`grid size-12 place-items-center rounded-full transition-colors duration-150 hover:bg-hover ${
          open ? 'bg-hover' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-base font-semibold text-on-accent"
        >
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="sr-only">{t('nav.yourAccount')}, </span>
        <bdi dir="ltr" className="sr-only">
          {email}
        </bdi>
      </button>

      {open && (
        <div
          id={menuId}
          className="glass-panel absolute end-0 top-full z-30 mt-2 w-64 rounded-panel border border-line p-1.5 shadow-menu lg:start-full lg:end-auto lg:top-auto lg:bottom-0 lg:mt-0 lg:ms-3"
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
  'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-start text-sm font-medium transition-colors duration-150 hover:bg-hover disabled:opacity-60'
