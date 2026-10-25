import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

/** Any address the app doesn't have, rather than quietly showing the home page. */
export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="max-w-xl">
      <h1 className="page-title">{t('notFound.title')}</h1>
      <p className="lede">{t('notFound.body')}</p>
      <p className="mt-8">
        <Link to="/" className="btn btn-primary">
          {t('notFound.home')}
        </Link>
      </p>
    </div>
  )
}
