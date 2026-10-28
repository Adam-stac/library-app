import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import Icon, { type IconName } from './Icon'

export type Section = { to: string; key: string; icon: IconName; end?: boolean }

/**
 * On a phone, the tab bar has room for four sections; the rest are behind "More", which opens a short list above
 * it. A disclosure, like the account menu: it closes with Escape (focus goes back to the button), a tap elsewhere,
 * focus leaving it, or going to another page.
 */
export default function MoreMenu({ sections, className = '' }: { sections: Section[]; className?: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const container = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const onOne = sections.some(({ to }) => location.pathname.startsWith(to))

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpenOn(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div
      ref={container}
      className={`relative ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpenOn(null)
          button.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenOn(null)
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpenOn(open ? null : location.pathname)}
        className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors duration-150 ${
          open || onOne ? 'text-accent' : 'text-muted hover:text-ink'
        }`}
      >
        <Icon name="more" className="size-5.5" />
        {t('nav.more')}
      </button>
      {open && (
        <ul
          id={menuId}
          className="glass-panel absolute end-0 bottom-full z-30 mb-3 w-56 rounded-panel border border-line p-1.5 shadow-menu"
        >
          {sections.map(({ to, key, icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150 ${
                    isActive ? 'bg-accent-soft text-accent' : 'hover:bg-hover'
                  }`
                }
              >
                <Icon name={icon} className="size-4.5" />
                {t(`nav.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
