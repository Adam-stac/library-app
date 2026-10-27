import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import IndexList from '../components/IndexList'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { nameOf, otherNameOf, type PlacePage } from '../library'
import { useLoad } from '../useLoad'

const PAGE_SIZE = 50
const SCOPES = ['all', 'mine', 'shared'] as const
type Scope = (typeof SCOPES)[number]

/**
 * The places the account can use: its own and the shared list everyone starts with, in catalogue order, 50 to a
 * page. Tabs narrow it to one or the other.
 */
export default function PlacesPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const [searchParams] = useSearchParams()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const scope: Scope = SCOPES.find((s) => s === searchParams.get('scope')) ?? 'all'
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1)
  const [loaded] = useLoad<PlacePage>(
    `/api/v1/places?page=${page - 1}&size=${PAGE_SIZE}&sort=${language}&scope=${scope}`,
  )

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const places = loaded.status === 'ok' ? loaded.data : null
  const pages = places ? Math.max(1, Math.ceil(places.total / PAGE_SIZE)) : 1

  return (
    <section>
      <PageHeader
        title={t('places.title')}
        lede={t('places.intro')}
        actions={
          <Link to="/places/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            {t('places.add')}
          </Link>
        }
      />
      <Notice />

      <nav aria-label={t('places.show')} className="mt-8 flex flex-wrap gap-1 border-b border-line">
        {SCOPES.map((s) => (
          <Link
            key={s}
            to={`/places?scope=${s}`}
            aria-current={s === scope ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150 ${
              s === scope ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t(`places.scope.${s}`)}
          </Link>
        ))}
      </nav>

      {loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {places && places.total === 0 && <EmptyState text={t(`places.none.${scope}`)} />}
      {places && places.total > 0 && (
        <>
          <p className="mt-6 mb-2 text-sm text-muted">
            {t('places.count', { count: places.total, number: formatNumber(places.total, language) })}
          </p>
          <IndexList
            byLetter
            rows={places.items.map((place) => ({
              id: place.id,
              to: `/places/${encodeURIComponent(place.id)}`,
              name: nameOf(place, language),
              other: otherNameOf(place, language),
              end:
                (language === 'ar' ? (place.countryAr ?? place.countryEn) : (place.countryEn ?? place.countryAr)) ?? '',
            }))}
          />
          <Pagination page={page} pages={pages} linkTo={(n) => `/places?scope=${scope}&page=${n}`} />
        </>
      )}
    </section>
  )
}
