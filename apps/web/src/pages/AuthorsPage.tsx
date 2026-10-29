import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { getJson } from '../api'
import { useAuth } from '../auth/context'
import { type AuthorPage, formatNumber } from '../authors'
import AuthorIndex from '../components/AuthorIndex'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Loading from '../components/Loading'

const PAGE_SIZE = 50

/** The signed-in user's authors in catalogue order (by name in the page's language), 50 to a page. */
export default function AuthorsPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const pageNumber = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1)
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [result, setResult] = useState<{ key: string; page: AuthorPage | null; failed: boolean } | null>(null)
  const notice = (location.state as { notice?: string } | null)?.notice
  const key = `${language}:${pageNumber}`

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void getJson<AuthorPage>(`/api/v1/authors?page=${pageNumber - 1}&size=${PAGE_SIZE}&sort=${language}`).then(
      (response) => {
        if (!current) return
        if (response.ok && response.data) setResult({ key, page: response.data, failed: false })
        else if (response.status === 401) void refresh()
        else setResult({ key, page: null, failed: true })
      },
    )
    return () => {
      current = false
    }
  }, [state.status, refresh, pageNumber, language, key])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const shown = result?.key === key ? result : null
  const authors = shown?.page
  const pages = authors ? Math.max(1, Math.ceil(authors.total / PAGE_SIZE)) : 1

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="page-title">{t('authors.title')}</h1>
          <p className="lede">{t('authors.intro')}</p>
        </div>
        <Link to="/authors/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          {t('authors.add')}
        </Link>
      </header>

      {notice && (
        <p role="status" className="notice mt-8">
          <Icon name="check" className="mt-px size-4 text-accent" />
          {notice}
        </p>
      )}

      {!shown && <Loading shape="list" className="mt-8" />}
      {shown?.failed && (
        <p role="alert" className="mt-8 text-danger">
          {t('authors.loadFailed')}
        </p>
      )}

      {authors && authors.total === 0 && <EmptyState text={t('authors.none')} />}

      {authors && authors.total > 0 && (
        <>
          <p className="mt-10 mb-2 text-sm text-muted">
            {t('authors.count', { count: authors.total, number: formatNumber(authors.total, language) })}
          </p>
          <AuthorIndex authors={authors.items} byLetter />
          {pages > 1 && (
            <nav aria-label={t('authors.pages')} className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted">
                {t('authors.pageOf', {
                  page: formatNumber(pageNumber, language),
                  pages: formatNumber(pages, language),
                })}
              </span>
              <span className="flex gap-2">
                {pageNumber > 1 && (
                  <Link to={`/authors?page=${pageNumber - 1}`} className="btn">
                    <Icon name="back" className="size-4" />
                    {t('authors.previous')}
                  </Link>
                )}
                {pageNumber < pages && (
                  <Link to={`/authors?page=${pageNumber + 1}`} className="btn">
                    {t('authors.next')}
                    <Icon name="forward" className="size-4" />
                  </Link>
                )}
              </span>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
