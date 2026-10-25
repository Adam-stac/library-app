import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { getJson } from '../api'
import { useAuth } from '../auth/context'
import { type AuthorPage, displayName, formatNumber, lifeYears, otherName } from '../authors'

const PAGE_SIZE = 50

const primary =
  'inline-flex min-h-11 items-center rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900'
const pageLink =
  'inline-flex min-h-11 items-center rounded-full border border-stone-900 px-5 font-semibold hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900'

/** The signed-in user's authors, sorted by name in the page's language, 50 to a page. */
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t('authors.title')}</h1>
          <p className="mt-2 text-stone-700">{t('authors.intro')}</p>
        </div>
        <Link to="/authors/new" className={primary}>
          {t('authors.add')}
        </Link>
      </div>

      {notice && (
        <p role="status" className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">
          {notice}
        </p>
      )}

      {shown?.failed && (
        <p role="alert" className="mt-6 text-red-800">
          {t('authors.loadFailed')}
        </p>
      )}

      {authors && authors.total === 0 && <p className="mt-8 text-stone-700">{t('authors.none')}</p>}

      {authors && authors.total > 0 && (
        <>
          <p className="mt-8 text-stone-700">
            {t('authors.count', { count: authors.total, number: formatNumber(authors.total, language) })}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {authors.items.map((author) => {
              const other = otherName(author, language)
              const years = lifeYears(author, t, language)
              return (
                <li key={author.id}>
                  <Link
                    to={`/authors/${encodeURIComponent(author.id)}`}
                    className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                  >
                    <span className="block text-lg font-semibold break-words">
                      <bdi>{displayName(author, language)}</bdi>
                    </span>
                    {other && (
                      <span className="block break-words text-stone-700">
                        <bdi>{other}</bdi>
                      </span>
                    )}
                    {years && <span className="mt-1 block text-sm text-stone-700">{years}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
          {pages > 1 && (
            <nav aria-label={t('authors.pages')} className="mt-6 flex flex-wrap items-center gap-3">
              {pageNumber > 1 && (
                <Link to={`/authors?page=${pageNumber - 1}`} className={pageLink}>
                  {t('authors.previous')}
                </Link>
              )}
              <span className="text-stone-700">
                {t('authors.pageOf', {
                  page: formatNumber(pageNumber, language),
                  pages: formatNumber(pages, language),
                })}
              </span>
              {pageNumber < pages && (
                <Link to={`/authors?page=${pageNumber + 1}`} className={pageLink}>
                  {t('authors.next')}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  )
}
