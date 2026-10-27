import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/context'
import BenefitCard from '../components/BenefitCard'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import type { Benefit } from '../library'
import { useLoad } from '../useLoad'

/** One benefit on its own, as search finds it: its text and where it came from, to edit or delete. */
export default function BenefitPage() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [loaded] = useLoad<Benefit>(`/api/v1/benefits/${encodeURIComponent(id)}`)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  return (
    <article className="max-w-3xl">
      <PageHeader back={{ to: '/benefits', label: t('benefits.all') }} title={t('benefits.one')} />
      <Notice className="mt-6" />
      {(loaded.status === 'notFound' || loaded.status === 'failed') && (
        <p role="alert" className="mt-6 text-danger">
          {t(loaded.status === 'notFound' ? 'benefits.notFound' : 'common.loadFailed')}
        </p>
      )}
      {loaded.status === 'ok' && (
        <div className="mt-6 border-y border-line">
          <BenefitCard
            benefit={loaded.data}
            onDeleted={() => navigate('/benefits', { state: { notice: t('benefits.deleted') } })}
          />
        </div>
      )}
    </article>
  )
}
