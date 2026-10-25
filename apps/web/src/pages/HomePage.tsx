import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getJson } from '../api'
import { useAuth } from '../auth/context'
import { type AuthorPage, formatNumber } from '../authors'
import AuthorIndex from '../components/AuthorIndex'
import { Mark } from '../components/Brand'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'

const SHOWN = 5

/**
 * The home page. Signed in: the first authors in the library, the way to all of them, and adding one (the summary
 * of the whole library comes with the books' pages). Signed out: what the app is, creating an account and signing
 * in.
 */
export default function HomePage() {
  const { state } = useAuth()
  if (state.status === 'signedIn') return <Library />
  if (state.status === 'signedOut') return <Welcome />
  return null
}

function Welcome() {
  const { t } = useTranslation()

  return (
    <section className="flex max-w-lg flex-col items-center pt-4 text-center sm:pt-10">
      <Mark className="h-24 sm:h-28" />
      <h1 className="page-title mt-10">{t('home.title')}</h1>
      <p className="lede text-[1.0625rem]">{t('app.tagline')}</p>
      <p className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to="/register" className="btn btn-primary px-5">
          {t('home.createAccount')}
        </Link>
        <Link to="/sign-in" className="btn px-5">
          {t('home.signIn')}
        </Link>
      </p>
    </section>
  )
}

function Library() {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [result, setResult] = useState<{ language: string; page: AuthorPage | null } | null>(null)

  useEffect(() => {
    let current = true
    void getJson<AuthorPage>(`/api/v1/authors?page=0&size=${SHOWN}&sort=${language}`).then((response) => {
      if (!current) return
      if (response.ok && response.data) setResult({ language, page: response.data })
      else if (response.status === 401) void refresh()
      else setResult({ language, page: null })
    })
    return () => {
      current = false
    }
  }, [refresh, language])

  const shown = result?.language === language ? result : null
  const authors = shown?.page

  return (
    <section>
      <h1 className="page-title">{t('home.title')}</h1>
      <p className="lede">{t('app.tagline')}</p>

      <section aria-labelledby="authors-title" className="mt-14 max-w-3xl">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="authors-title" className="section-title">
            {t('home.authors')}
          </h2>
          {authors && authors.total > 0 && (
            <Link
              to="/authors"
              className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              {t('home.allAuthors', { number: formatNumber(authors.total, language) })}
              <Icon name="forward" className="size-3.5" />
            </Link>
          )}
        </div>

        {shown && !authors && (
          <p role="alert" className="mt-4 text-danger">
            {t('authors.loadFailed')}
          </p>
        )}
        {authors && authors.total === 0 && (
          <EmptyState text={t('home.noAuthors')}>
            <Link to="/authors/new" className="btn btn-primary">
              <Icon name="plus" className="size-4" />
              {t('authors.add')}
            </Link>
          </EmptyState>
        )}
        {authors && authors.total > 0 && (
          <div className="border-t border-line">
            <AuthorIndex authors={authors.items} />
          </div>
        )}
      </section>
    </section>
  )
}
