import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type AuthorSummary, displayName, indexYear, otherName } from '../authors'
import { indexLetter } from '../indexLetter'

type Props = {
  authors: AuthorSummary[]
  /** Show the letter each run of names is filed under, as in the index of a book (lists in catalogue order) */
  byLetter?: boolean
}

/**
 * Authors as the index of a book lists them: the name in Lateef, the other name beside it, and the year of death
 * at the end of the line, as classical books cite scholars (ت ٢٥٦هـ). Each row opens the author.
 */
export default function AuthorIndex({ authors, byLetter = false }: Props) {
  const { i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'

  // Runs of names that share a first letter. The API sends them in catalogue order, so each letter is one run.
  const runs: { letter: string; authors: AuthorSummary[] }[] = []
  for (const author of authors) {
    const letter = byLetter ? indexLetter(displayName(author, language)) : ''
    const last = runs.at(-1)
    if (last && last.letter === letter) last.authors.push(author)
    else runs.push({ letter, authors: [author] })
  }

  if (!byLetter) return <Rows authors={authors} language={language} />

  return (
    <div className="border-t border-line">
      {runs.map((run, i) => (
        <div key={`${run.letter}-${i}`} className="border-b border-line sm:grid sm:grid-cols-[4rem_minmax(0,1fr)]">
          {/* The rows already start with the name, so the letter is only for the eye */}
          <p aria-hidden="true" className="font-book pt-4 text-[1.625rem] leading-none text-accent sm:pt-[1.125rem]">
            {run.letter}
          </p>
          <Rows authors={run.authors} language={language} />
        </div>
      ))}
    </div>
  )
}

function Rows({ authors, language }: { authors: AuthorSummary[]; language: 'ar' | 'en' }) {
  const { t } = useTranslation()

  return (
    <ul className="divide-y divide-line">
      {authors.map((author) => {
        const other = otherName(author, language)
        const year = indexYear(author, t, language)
        return (
          <li key={author.id}>
            <Link
              to={`/authors/${encodeURIComponent(author.id)}`}
              className="group -mx-3 flex items-baseline gap-x-6 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-hover"
            >
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
                <span className="font-book text-xl leading-snug font-medium break-words transition-colors duration-150 group-hover:text-accent">
                  <bdi>{displayName(author, language)}</bdi>
                </span>
                {other && (
                  <span className="font-book text-sm break-words text-muted">
                    <bdi>{other}</bdi>
                  </span>
                )}
              </span>
              {year && <span className="shrink-0 text-sm text-muted">{year}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
