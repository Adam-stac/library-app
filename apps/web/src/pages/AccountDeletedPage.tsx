import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'

export default function AccountDeletedPage() {
  const { t } = useTranslation()
  const { refresh } = useAuth()

  // The session has ended on the server: catch up, so the page header shows "Sign in"
  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section role="status" className="max-w-md">
      <h1 className="page-title">{t('account.deletedTitle')}</h1>
      <p className="lede mt-3">{t('account.deletedBody')}</p>
      <p className="mt-8">
        <Link to="/" className="link">
          {t('verify.goHome')}
        </Link>
      </p>
    </section>
  )
}
