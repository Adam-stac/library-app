import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { deleteJson, getJson } from '../api'
import { useAuth } from '../auth/context'
import { type Author, displayName, formatYear, hasWorkedOutCe, otherName } from '../authors'
import ConfirmDelete from '../components/ConfirmDelete'
import Details from '../components/Details'
import Icon from '../components/Icon'
import IndexList from '../components/IndexList'
import { type Named, nameOf, type WorkPage, workTitle } from '../library'
import { useLoad } from '../useLoad'

/** One author: names, years and biography, with Edit and Delete. */
export default function AuthorPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, setLoaded] = useState<{ id: string; author: Author | null; error: string | null } | null>(null)
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
              <h1 className="font-book text-display leading-tight font-semibold break-words sm:text-display-lg">
                <bdi>{displayName(author, language)}</bdi>
              </h1>
              {otherName(author, language) && (
                <p className="font-book mt-1 text-lg break-words text-muted">
                  <bdi>{otherName(author, language)}</bdi>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:pt-2 has-[>div]:basis-full">
              <Link to={`/authors/${encodeURIComponent(author.id)}/edit`} className="btn">
                <Icon name="pencil" className="size-4" />
                {t('authors.edit')}
              </Link>
              <ConfirmDelete
                label={t('authors.delete')}
                question={t('authors.deleteConfirm', { name: displayName(author, language) })}
                onDelete={() => deleteJson(`/api/v1/authors/${encodeURIComponent(author.id)}`)}
                onDeleted={() =>
                  navigate('/authors', {
                    state: { notice: t('authors.deleted', { name: displayName(author, language) }) },
                  })
                }
              />
            </div>
          </header>

          {notice && (
            <p role="status" className="notice mt-6">
              <Icon name="check" className="mt-px size-4 text-accent" />
              {notice}
            </p>
          )}

          <AuthorDetails author={author} />

          <AuthorBooks authorId={author.id} />

          {author.biography && (
            <section aria-labelledby="biography" className="mt-12">
              <h2 id="biography" className="section-title">
                {t('authors.biography')}
              </h2>
              <p
                className="font-book mt-3 max-w-[65ch] text-lg leading-reading break-words whitespace-pre-line"
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

function AuthorDetails({ author }: { author: Author }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const place = (named: Named | null) =>
    named && (
      <Link to={`/places/${encodeURIComponent(named.id)}`} className="link font-book text-reading font-normal">
        <bdi>{nameOf(named, language)}</bdi>
      </Link>
    )

  return (
    <>
      {/* Names are words from the library, so they are set in its font; years are the app's */}
      <Details
        rows={[
          { label: t('authors.born'), value: formatYear(author.birth, t, language) },
          { label: t('authors.birthPlace'), value: place(author.birthPlace) },
          { label: t('authors.died'), value: formatYear(author.death, t, language) },
          { label: t('authors.deathPlace'), value: place(author.deathPlace) },
          { label: t('authors.form.fullName'), value: author.fullName, book: true },
          { label: t('authors.form.ism'), value: author.ism, book: true },
          { label: t('authors.form.kunya'), value: author.kunya, book: true },
          { label: t('authors.form.laqab'), value: author.laqab, book: true },
          { label: t('authors.form.nisba'), value: author.nisba, book: true },
        ]}
      />
      {hasWorkedOutCe(author) && <p className="mt-3 text-sm text-muted">{t('authors.workedOut')}</p>}
    </>
  )
}

/** The works in the library that name this author, each leading to its copies on the shelf. */
function AuthorBooks({ authorId }: { authorId: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [works] = useLoad<WorkPage>(
    `/api/v1/works?page=0&size=100&sort=${language}&authorId=${encodeURIComponent(authorId)}`,
  )
  if (works.status !== 'ok' || works.data.total === 0) return null

  return (
    <section aria-labelledby="author-books" className="mt-12">
      <h2 id="author-books" className="section-title mb-2">
        {t('authors.books')}
      </h2>
      <IndexList
        rows={works.data.items.map((work) => ({
          id: work.id,
          to: `/books?work=${encodeURIComponent(work.id)}`,
          name: workTitle(work, language),
          other: language === 'ar' ? (work.titleAr ? work.titleEn : null) : work.titleEn ? work.titleAr : null,
          end: work.science && <bdi className="font-book">{nameOf(work.science, language)}</bdi>,
        }))}
      />
    </section>
  )
}
