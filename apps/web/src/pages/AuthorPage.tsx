import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { deleteJson, getJson } from '../api'
import { useAuth } from '../auth/context'
import { type Author, displayName, formatYear, hasWorkedOutCe, otherName } from '../authors'
import Icon from '../components/Icon'

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
      else
        setLoaded({
          id,
          author: null,
          error: response.status === 404 || response.status === 400 ? 'notFound' : 'loadFailed',
        })
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
    <article className="max-w-3xl">
      <Link to="/authors" className="back-link">
        <Icon name="back" className="size-4" />
        {t('authors.all')}
      </Link>

      {shown?.error && (
        <p role="alert" className="mt-6 text-danger">
          {t(`authors.${shown.error}`)}
        </p>
      )}

      {author && (
        <>
          <header className="mt-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <h1 className="font-book text-[2.25rem] leading-tight font-semibold break-words sm:text-[2.75rem]">
                <bdi>{displayName(author, language)}</bdi>
              </h1>
              {otherName(author, language) && (
                <p className="font-book mt-1 text-lg break-words text-muted">
                  <bdi>{otherName(author, language)}</bdi>
                </p>
              )}
            </div>
            <div className="flex gap-2 sm:pt-2">
              <Link to={`/authors/${encodeURIComponent(author.id)}/edit`} className="btn">
                <Icon name="pencil" className="size-4" />
                {t('authors.edit')}
              </Link>
              {!confirming && (
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
                  <Icon name="trash" className="size-4" />
                  {t('authors.delete')}
                </button>
              )}
            </div>
          </header>

          {confirming && (
            <div className="mt-6 rounded-xl border border-danger-line bg-danger-soft p-5">
              <p>{t('authors.deleteConfirm', { name: displayName(author, language) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={deleting}
                  onClick={() => void onDelete(author)}
                >
                  {t('authors.deleteYes')}
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  {t('authors.cancel')}
                </button>
              </div>
              {deleteError && (
                <p role="alert" className="mt-3 text-danger">
                  {t(`errors.${deleteError}`, { defaultValue: t('errors.unexpected') })}
                </p>
              )}
            </div>
          )}

          {notice && (
            <p role="status" className="notice mt-6">
              <Icon name="check" className="mt-px size-4 text-accent" />
              {notice}
            </p>
          )}

          <Details author={author} />

          {author.biography && (
            <section aria-labelledby="biography" className="mt-12">
              <h2 id="biography" className="section-title">
                {t('authors.biography')}
              </h2>
              <p
                className="font-book mt-3 max-w-[65ch] text-lg leading-[1.85] break-words whitespace-pre-line"
                dir="auto"
              >
                {author.biography}
              </p>
            </section>
          )}
        </>
      )}
    </article>
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
  // Names are words from the library, so they are set in its font; years are the app's
  const rows: { label: string; value: string; name: boolean }[] = [
    ...(birth ? [{ label: 'authors.born', value: birth, name: false }] : []),
    ...(death ? [{ label: 'authors.died', value: death, name: false }] : []),
    ...names.flatMap(([label, value]) => (value === null ? [] : [{ label, value, name: true }])),
  ]
  if (rows.length === 0) return null

  return (
    <>
      <dl className="mt-10 border-t border-line">
        {rows.map(({ label, value, name }) => (
          <div key={label} className="grid gap-1 border-b border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
            <dt className="text-sm text-muted sm:pt-0.5">{t(label)}</dt>
            <dd className={`break-words ${name ? 'font-book text-[1.0625rem]' : ''}`}>
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {hasWorkedOutCe(author) && <p className="mt-3 text-sm text-muted">{t('authors.workedOut')}</p>}
    </>
  )
}
