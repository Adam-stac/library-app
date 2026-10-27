import { useTranslation } from 'react-i18next'
import { type AuthorSummary, displayName, indexYear, otherName } from '../authors'
import IndexList from './IndexList'

type Props = {
  authors: AuthorSummary[]
  /** Show the letter each run of names is filed under, as in the index of a book (lists in catalogue order) */
  byLetter?: boolean
}

/**
 * Authors as the index of a book lists them: the name, the other name beside it, and the year of death at the end
 * of the line, as classical books cite scholars (ت ٢٥٦هـ). Each row opens the author.
 */
export default function AuthorIndex({ authors, byLetter = false }: Props) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'

  return (
    <IndexList
      byLetter={byLetter}
      rows={authors.map((author) => ({
        id: author.id,
        to: `/authors/${encodeURIComponent(author.id)}`,
        name: displayName(author, language),
        other: otherName(author, language),
        end: indexYear(author, t, language),
      }))}
    />
  )
}
