import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatNumber } from '../authors'
import Icon from './Icon'

type Props = {
  page: number
  pages: number
  /** The address of a page, given its number (1 is the first) */
  linkTo: (page: number) => string
}

/** "Page 2 of 5", with Previous and Next. Nothing when everything fits on one page. */
export default function Pagination({ page, pages, linkTo }: Props) {
  const { t, i18n } = useTranslation()
  if (pages <= 1) return null

  return (
    <nav aria-label={t('common.pages')} className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted">
        {t('common.pageOf', {
          page: formatNumber(page, i18n.language),
          pages: formatNumber(pages, i18n.language),
        })}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link to={linkTo(page - 1)} className="btn">
            <Icon name="back" className="size-4" />
            {t('common.previous')}
          </Link>
        )}
        {page < pages && (
          <Link to={linkTo(page + 1)} className="btn">
            {t('common.next')}
            <Icon name="forward" className="size-4" />
          </Link>
        )}
      </span>
    </nav>
  )
}
