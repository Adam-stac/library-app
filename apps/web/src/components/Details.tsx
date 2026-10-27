import type { ReactNode } from 'react'

export type DetailRow = {
  label: string
  /** Rows with no value are left out */
  value: ReactNode
  /** Library words (names, titles) are set in Lateef */
  book?: boolean
}

/** A record's details as a two-column list with hairlines: the label, then the value. Nothing if every row is empty. */
export default function Details({ rows, className = 'mt-10' }: { rows: DetailRow[]; className?: string }) {
  const shown = rows.filter(
    (row) => row.value !== null && row.value !== undefined && row.value !== '' && row.value !== false,
  )
  if (shown.length === 0) return null

  return (
    <dl className={`border-t border-line ${className}`}>
      {shown.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 border-b border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"
        >
          <dt className="text-sm text-muted sm:pt-0.5">{row.label}</dt>
          <dd className={`break-words ${row.book ? 'font-book text-[1.0625rem]' : ''}`}>
            {typeof row.value === 'string' ? <bdi>{row.value}</bdi> : row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
