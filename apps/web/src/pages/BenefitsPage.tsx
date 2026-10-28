import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import BenefitCard from '../components/BenefitCard'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { type BenefitPage, bookTitle, type Edition } from '../library'
import { useLoad } from '../useLoad'

const PAGE_SIZE = 20

/** The benefits (فوائد) saved from your reading, newest first, 20 to a page. `?book=` narrows it to one book. */
export default function BenefitsPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const [searchParams] = useSearchParams()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const bookId = searchParams.get('book')
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1)
  const [loaded, { reload }] = useLoad<BenefitPage>(
    `/api/v1/benefits?page=${page - 1}&size=${PAGE_SIZE}${bookId ? `&editionId=${encodeURIComponent(bookId)}` : ''}`,
  )
  const [book] = useLoad<Edition>(bookId ? `/api/v1/editions/${encodeURIComponent(bookId)}` : null)
  const [deleted, setDeleted] = useState(false)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const benefits = loaded.status === 'ok' ? loaded.data : null
  const pages = benefits ? Math.max(1, Math.ceil(benefits.total / PAGE_SIZE)) : 1
  const addTo = bookId ? `/benefits/new?book=${encodeURIComponent(bookId)}` : '/benefits/new'

  return (
    <section className="max-w-3xl">
      <PageHeader
        title={t('benefits.title')}
        lede={
          bookId && book.status === 'ok' ? (
            <>
              {t('benefits.from')} <bdi className="font-book text-ink">{bookTitle(book.data, language)}</bdi>
              {' · '}
              <Link to="/benefits" className="link">
                {t('benefits.all')}
              </Link>
            </>
          ) : (
            t('benefits.intro')
          )
        }
        actions={
          <Link to={addTo} className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            {t('benefits.add')}
          </Link>
        }
      />
      <Notice />
      {deleted && (
        <p role="status" className="notice mt-8">
          <Icon name="check" className="mt-px size-4 text-accent" />
          {t('benefits.deleted')}
        </p>
      )}

      {loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {benefits && benefits.total === 0 && <EmptyState text={t(bookId ? 'benefits.noneFromBook' : 'benefits.none')} />}
      {benefits && benefits.total > 0 && (
        <>
          <p className="mt-8 mb-1 text-sm text-muted">
            {t('benefits.count', { count: benefits.total, number: formatNumber(benefits.total, language) })}
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {benefits.items.map((benefit) => (
              <li key={benefit.id}>
                <BenefitCard
                  benefit={benefit}
                  withoutBook={Boolean(bookId)}
                  onDeleted={() => {
                    setDeleted(true)
                    reload()
                  }}
                />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pages={pages}
            linkTo={(n) => `/benefits?${bookId ? `book=${encodeURIComponent(bookId)}&` : ''}page=${n}`}
          />
        </>
      )}
    </section>
  )
}
