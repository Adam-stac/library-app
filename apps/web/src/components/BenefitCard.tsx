import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { deleteJson } from '../api'
import { citationText, formatInstant } from '../books'
import { type Benefit, bookTitle } from '../library'
import ConfirmDelete from './ConfirmDelete'
import Icon from './Icon'

type Props = {
  benefit: Benefit
  /** Leave out the book's title (on the book's own page) */
  withoutBook?: boolean
  /** Edit and delete, with what happens after a deletion */
  onDeleted?: () => void
}

/**
 * One benefit: its text in the library's font, then where it came from (the book, volume and page), when it was
 * saved, and whether it came through Ḥāsib. With `onDeleted`, it can also be edited and deleted.
 */
export default function BenefitCard({ benefit, withoutBook = false, onDeleted }: Props) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const citation = citationText(benefit.volume, benefit.page, t, language)

  return (
    <article className="flex flex-col gap-3 py-5">
      <p className="font-book max-w-[65ch] text-lg leading-reading break-words whitespace-pre-line" dir="auto">
        {benefit.text}
      </p>
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {benefit.edition && !withoutBook && (
          <Link to={`/books/${encodeURIComponent(benefit.edition.id)}`} className="link font-book text-ui">
            <bdi>{bookTitle(benefit.edition, language)}</bdi>
          </Link>
        )}
        {citation && <span>{citation}</span>}
        <span>{formatInstant(benefit.createdAt, language)}</span>
        {benefit.source === 'hasib' && (
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-medium">{t('benefits.fromHasib')}</span>
        )}
        {onDeleted && (
          <span className="ms-auto flex flex-wrap gap-1 has-[>div]:basis-full">
            <Link
              to={`/benefits/${encodeURIComponent(benefit.id)}/edit`}
              className="btn btn-ghost"
              aria-label={t('benefits.editNamed', { date: formatInstant(benefit.createdAt, language) })}
            >
              <Icon name="pencil" className="size-4" />
              {t('common.edit')}
            </Link>
            <ConfirmDelete
              label={t('common.delete')}
              hiddenName={t('benefits.fromDate', { date: formatInstant(benefit.createdAt, language) })}
              question={t('benefits.deleteConfirm')}
              onDelete={() => deleteJson(`/api/v1/benefits/${encodeURIComponent(benefit.id)}`)}
              onDeleted={onDeleted}
            />
          </span>
        )}
      </footer>
    </article>
  )
}
