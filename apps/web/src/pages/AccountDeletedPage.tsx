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
      <h1 className="text-3xl font-semibold">{t('account.deletedTitle')}</h1>
      <p className="mt-4 text-lg text-stone-700">{t('account.deletedBody')}</p>
      <p className="mt-8">
        <Link to="/" className="font-semibold underline underline-offset-4">
          {t('verify.goHome')}
        </Link>
      </p>
    </section>
  )
}
