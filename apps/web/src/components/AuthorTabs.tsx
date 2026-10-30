import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

/** The two ways to see your authors: the index (List) and the timeline */
export default function AuthorTabs({ current }: { current: 'list' | 'timeline' }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('authors.views')} className="tabs mt-8">
      <Link to="/authors" aria-current={current === 'list' ? 'page' : undefined} className="tab">
        {t('authors.list')}
      </Link>
      <Link to="/authors/timeline" aria-current={current === 'timeline' ? 'page' : undefined} className="tab">
        {t('authors.timeline')}
      </Link>
    </nav>
  )
}
