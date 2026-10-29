import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import { volumesText } from '../books'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import IndexList from '../components/IndexList'
import Loading from '../components/Loading'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import StatusTag from '../components/StatusTag'
import { authorsOf, bookTitle, type EditionPage, type Work, workTitle } from '../library'
import { useLoad } from '../useLoad'

const PAGE_SIZE = 50
const ORDERS = ['title', 'added'] as const
type Order = (typeof ORDERS)[number]

/**
 * The books on the shelf (each copy owned), in catalogue order by title or newest first, 50 to a page. `?work=`
 * narrows it to the copies of one work.
 */
export default function BooksPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const [searchParams] = useSearchParams()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const order: Order = ORDERS.find((o) => o === searchParams.get('order')) ?? 'title'
  const workId = searchParams.get('work')
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1)
  const sort = order === 'added' ? 'added' : language
  const [loaded] = useLoad<EditionPage>(
    `/api/v1/editions?page=${page - 1}&size=${PAGE_SIZE}&sort=${sort}${workId ? `&workId=${encodeURIComponent(workId)}` : ''}`,
  )
  const [work] = useLoad<Work>(workId ? `/api/v1/works/${encodeURIComponent(workId)}` : null)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const books = loaded.status === 'ok' ? loaded.data : null
  const pages = books ? Math.max(1, Math.ceil(books.total / PAGE_SIZE)) : 1
  const address = (o: Order, n = 1) =>
    `/books?order=${o}${workId ? `&work=${encodeURIComponent(workId)}` : ''}${n > 1 ? `&page=${n}` : ''}`

  return (
    <section>
      <PageHeader
        title={t('books.title')}
        lede={
          workId && work.status === 'ok' ? (
            <>
              {t('books.copiesOf')} <bdi className="font-book text-ink">{workTitle(work.data, language)}</bdi>
              {' · '}
              <Link to="/books" className="link">
                {t('books.all')}
              </Link>
            </>
          ) : (
            t('books.intro')
          )
        }
        actions={
          <Link to="/books/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            {t('books.add')}
          </Link>
        }
      />
      <Notice />

      <nav aria-label={t('books.order')} className="tabs mt-8">
        {ORDERS.map((o) => (
          <Link key={o} to={address(o)} aria-current={o === order ? 'page' : undefined} className="tab">
            {t(`books.orders.${o}`)}
          </Link>
        ))}
      </nav>

      {loaded.status === 'loading' && <Loading shape="list" className="mt-8" />}
      {loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {books && books.total === 0 && <EmptyState text={t('books.none')} />}
      {books && books.total > 0 && (
        <>
          <p className="mt-6 mb-2 text-sm text-muted">
            {t('books.count', { count: books.total, number: formatNumber(books.total, language) })}
          </p>
          <IndexList
            byLetter={order === 'title'}
            rows={books.items.map((book) => ({
              id: book.id,
              to: `/books/${encodeURIComponent(book.id)}`,
              name: bookTitle(book, language),
              other: authorsOf(book.work, language) || null,
              tag: <StatusTag status={book.status} />,
              end: volumesText(book.volumes, t, language),
            }))}
          />
          <Pagination page={page} pages={pages} linkTo={(n) => address(order, n)} />
        </>
      )}
    </section>
  )
}
