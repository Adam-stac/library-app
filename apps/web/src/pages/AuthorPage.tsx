import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { deleteJson, getJson } from '../api'
import { useAuth } from '../auth/context'
import { type Author, displayName, formatYear, hasWorkedOutCe, otherName } from '../authors'

const button =
  'inline-flex min-h-11 items-center rounded-full px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'
const primary = `${button} bg-stone-900 text-white hover:bg-stone-700`
const secondary = `${button} border border-stone-900 hover:bg-stone-100`
const danger = `${button} bg-red-800 text-white hover:bg-red-700`

/** One author: names, years and biography, with Edit and Delete. */
export default function AuthorPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, setLoaded] = useState<{ id: string; author: Author | null; error: string | null } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const notice = (location.state as { notice?: string } | null)?.notice

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void getJson<Author>(`/api/v1/authors/${encodeURIComponent(id)}`).then((response) => {
      if (!current) return
      if (response.ok && response.data) setLoaded({ id, author: response.data, error: null })
      else if (response.status === 401) void refresh()
      else setLoaded({ id, author: null, error: response.status === 404 || response.status === 400 ? 'notFound' : 'loadFailed' })
    })
    return () => {
      current = false
    }
  }, [state.status, refresh, id])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const shown = loaded?.id === id ? loaded : null
  const author = shown?.author

  async function onDelete(current: Author) {
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteJson(`/api/v1/authors/${encodeURIComponent(current.id)}`)
    setDeleting(false)
    if (result.ok || result.status === 404) {
      navigate('/authors', { state: { notice: t('authors.deleted', { name: displayName(current, language) }) } })
    } else if (result.status === 401) {
      void refresh()
    } else {
      setDeleteError(result.code)
    }
  }

  return (
    <section className="max-w-2xl">
      <p>
        <Link to="/authors" className="font-semibold underline underline-offset-4">
          {t('authors.all')}
        </Link>
      </p>

      {shown?.error && (
        <p role="alert" className="mt-6 text-red-800">
          {t(`authors.${shown.error}`)}
        </p>
      )}

      {author && (
        <>
          <h1 className="mt-6 text-3xl font-semibold break-words">
            <bdi>{displayName(author, language)}</bdi>
          </h1>
          {otherName(author, language) && (
            <p className="mt-1 text-xl break-words text-stone-700">
              <bdi>{otherName(author, language)}</bdi>
            </p>
          )}

          {notice && (
            <p role="status" className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">
              {notice}
            </p>
          )}

          <Details author={author} />

          {author.biography && (
            <>
              <h2 className="mt-8 text-lg font-semibold">{t('authors.biography')}</h2>
              <p className="mt-2 whitespace-pre-line break-words" dir="auto">
                {author.biography}
              </p>
            </>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link to={`/authors/${encodeURIComponent(author.id)}/edit`} className={primary}>
              {t('authors.edit')}
            </Link>
            {!confirming && (
              <button type="button" className={secondary} onClick={() => setConfirming(true)}>
                {t('authors.delete')}
              </button>
            )}
          </div>

          {confirming && (
            <div className="mt-6 rounded-lg border border-red-300 bg-white p-4">
              <p>{t('authors.deleteConfirm', { name: displayName(author, language) })}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className={danger} disabled={deleting} onClick={() => void onDelete(author)}>
                  {t('authors.deleteYes')}
                </button>
                <button type="button" className={secondary} onClick={() => setConfirming(false)}>
                  {t('authors.cancel')}
                </button>
              </div>
              {deleteError && (
                <p role="alert" className="mt-3 text-red-800">
                  {t(`errors.${deleteError}`, { defaultValue: t('errors.unexpected') })}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Details({ author }: { author: Author }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const birth = formatYear(author.birth, t, language)
  const death = formatYear(author.death, t, language)
  const names: [string, string | null][] = [
    ['authors.form.fullName', author.fullName],
    ['authors.form.ism', author.ism],
    ['authors.form.kunya', author.kunya],
    ['authors.form.laqab', author.laqab],
    ['authors.form.nisba', author.nisba],
  ]
  const rows: [string, string][] = [
    ...(birth ? [['authors.born', birth] as [string, string]] : []),
    ...(death ? [['authors.died', death] as [string, string]] : []),
    ...names.filter((row): row is [string, string] => row[1] !== null),
  ]
  if (rows.length === 0) return null

  return (
    <>
      <dl className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold">{t(label)}</dt>
            <dd className="break-words">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {hasWorkedOutCe(author) && <p className="mt-3 text-sm text-stone-700">{t('authors.workedOut')}</p>}
    </>
  )
}
