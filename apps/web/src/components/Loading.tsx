import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  /** A whole page (a title and a panel), or the rows of a list */
  shape?: 'page' | 'list'
  /** How many rows, for a list */
  rows?: number
  className?: string
}

/**
 * Stands in for what a page is loading: grey blocks in the shape of what is coming, so the reader can see it is on
 * its way. They wait a quarter of a second first, so a quick answer never flashes them. Screen readers hear
 * "Loading…" and the area is marked busy; the blocks themselves are hidden from them.
 */
export default function Loading({ shape = 'page', rows = 3, className = '' }: Props) {
  const { t } = useTranslation()
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowing(true), 250)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{t('common.loading')}</span>
      {showing && shape === 'page' && (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-11 w-2/3 max-w-lg" />
          <div className="skeleton h-5 w-1/2 max-w-sm" />
          <div className="skeleton mt-6 h-56 rounded-card" />
        </div>
      )}
      {showing && shape === 'list' && (
        <ul aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: rows }, (_, row) => (
            <li key={row} className="flex items-center gap-4 py-2">
              <div className="skeleton size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="skeleton h-4" style={{ width: `${Math.max(35, 70 - row * 12)}%` }} />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
