import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { indexLetter } from '../indexLetter'

export type IndexRow = {
  id: string
  to: string
  /** The name or title in the page's language (or the other, if that's all there is): what the list is sorted by */
  name: string
  /** The other name, beside it */
  other?: string | null
  /** At the end of the line, such as the year of death */
  end?: ReactNode
  /** A small label after the names, such as "Reading" */
  tag?: ReactNode
}

type Props = {
  rows: IndexRow[]
  /** Show the letter each run of names is filed under, as in the index of a book (lists in catalogue order) */
  byLetter?: boolean
}

/**
 * A list read like the index of a book: names in Lateef, the other name beside them, and a short note at the end of
 * the line. Each row opens its record. In catalogue order, runs of names are grouped under their letter
 * (indexLetter repeats the database's order exactly, so each letter is one run).
 */
export default function IndexList({ rows, byLetter = false }: Props) {
  if (!byLetter) return <Rows rows={rows} />

  const runs: { letter: string; rows: IndexRow[] }[] = []
  for (const row of rows) {
    const letter = indexLetter(row.name)
    const last = runs.at(-1)
    if (last && last.letter === letter) last.rows.push(row)
    else runs.push({ letter, rows: [row] })
  }

  return (
    <div className="border-t border-line">
      {runs.map((run, i) => (
        <div key={`${run.letter}-${i}`} className="border-b border-line sm:grid sm:grid-cols-[4rem_minmax(0,1fr)]">
          {/* The rows already start with the name, so the letter is only for the eye */}
          <p aria-hidden="true" className="font-book pt-4 text-[1.625rem] leading-none text-accent sm:pt-[1.125rem]">
            {run.letter}
          </p>
          <Rows rows={run.rows} />
        </div>
      ))}
    </div>
  )
}

function Rows({ rows }: { rows: IndexRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            to={row.to}
            className="group -mx-3 flex items-baseline gap-x-6 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-hover"
          >
            <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
              <span className="font-book text-xl leading-snug font-medium break-words transition-colors duration-150 group-hover:text-accent">
                <bdi>{row.name}</bdi>
              </span>
              {row.other && (
                <span className="font-book text-sm break-words text-muted">
                  <bdi>{row.other}</bdi>
                </span>
              )}
              {row.tag}
            </span>
            {row.end && <span className="shrink-0 text-sm text-muted">{row.end}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
