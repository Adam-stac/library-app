import type { TFunction } from 'i18next'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { type ApiResult, deleteJson, getJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import {
  bookmarkText,
  editionInputOf,
  formatDate,
  formatPrice,
  languageName,
  statusText,
  today,
  volumesText,
} from '../books'
import BenefitCard from '../components/BenefitCard'
import ConfirmDelete from '../components/ConfirmDelete'
import Details, { type DetailRow } from '../components/Details'
import Icon from '../components/Icon'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import {
  type BenefitPage,
  type Bookmark,
  bookTitle,
  type Edition,
  type EditionPage,
  errorMessage,
  nameOf,
  wholeNumber,
  workTitle,
} from '../library'
import { useLoad } from '../useLoad'

/**
 * One book on the shelf: its title and authors, where you are in it (the bookmark), when you started and finished
 * it, and everything recorded about the copy. Edit and delete.
 */
export default function BookPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { reload, replace }] = useLoad<Edition>(`/api/v1/editions/${encodeURIComponent(id)}`)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const back = { to: '/books', label: t('books.all') }
  if (loaded.status === 'notFound' || loaded.status === 'failed') {
    return (
      <article className="max-w-3xl">
        <PageHeader back={back} title={t('books.title')} />
        <p role="alert" className="mt-6 text-danger">
          {t(loaded.status === 'notFound' ? 'books.notFound' : 'common.loadFailed')}
        </p>
      </article>
    )
  }
  if (loaded.status !== 'ok') return null

  const book = loaded.data
  const title = bookTitle(book, language)
  const workName = workTitle(book.work, language)
  const otherTitle = book.title ? (workName !== book.title ? workName : null) : otherWorkTitle(book, language)

  /** Deletes the copy; when it was the last copy of its work, the work goes too, so nothing is left behind. */
  async function deleteBook(): Promise<ApiResult> {
    const result = await deleteJson(`/api/v1/editions/${encodeURIComponent(book.id)}`)
    if (!result.ok) return result
    const others = await getJson<EditionPage>(
      `/api/v1/editions?page=0&size=1&sort=added&workId=${encodeURIComponent(book.work.id)}`,
    )
    if (others.ok && others.data && others.data.total === 0) {
      await deleteJson(`/api/v1/works/${encodeURIComponent(book.work.id)}`)
    }
    return result
  }

  const details: DetailRow[] = [
    { label: t('books.fields.shelf'), value: book.shelf, book: true },
    { label: t('books.fields.publisher'), value: book.publisher, book: true },
    { label: t('books.fields.muhaqqiq'), value: book.muhaqqiq, book: true },
    { label: t('books.fields.translator'), value: book.translator, book: true },
    { label: t('books.fields.publicationPlace'), value: book.publicationPlace, book: true },
    { label: t('books.fields.published'), value: publishedText(book, t, language) },
    {
      label: t('books.fields.editionNumber'),
      value: book.editionNumber && formatNumber(book.editionNumber, language),
    },
    { label: t('books.fields.language'), value: book.language && languageName(book.language, language) },
    { label: t('books.fields.volumes'), value: book.volumes && formatNumber(book.volumes, language) },
    { label: t('books.fields.isbn'), value: book.isbn && <bdi dir="ltr">{book.isbn}</bdi> },
    {
      label: t('books.fields.legalDeposit'),
      value: book.legalDeposit && <bdi dir="ltr">{book.legalDeposit}</bdi>,
    },
    { label: t('books.fields.purchasedOn'), value: book.purchasedOn && formatDate(book.purchasedOn, language) },
    { label: t('books.fields.price'), value: book.price && formatPrice(book.price, language) },
  ]

  return (
    <article className="max-w-5xl">
      <PageHeader
        back={back}
        book
        above={
          <p className="mb-4 flex flex-wrap gap-2">
            {book.work.science && (
              <Link to="/sciences" className="pill bg-accent-soft text-accent">
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                <bdi>{nameOf(book.work.science, language)}</bdi>
              </Link>
            )}
            {book.status !== 'not_started' && (
              <span className={`pill ${book.status === 'reading' ? 'bg-accent-soft text-accent' : 'bg-field'}`}>
                {statusText(book.status, t)}
              </span>
            )}
            {volumesText(book.volumes, t, language) && (
              <span className="pill border border-line text-muted">{volumesText(book.volumes, t, language)}</span>
            )}
          </p>
        }
        title={<bdi>{title}</bdi>}
        lede={
          <>
            {otherTitle && (
              <span className="font-book block text-xl">
                <bdi>{otherTitle}</bdi>
              </span>
            )}
            {book.work.authors.length > 0 && (
              <span className="mt-2 block">
                {book.work.authors.map((author, index) => (
                  <span key={author.id}>
                    {index > 0 && (language === 'ar' ? '، ' : ', ')}
                    <Link
                      to={`/authors/${encodeURIComponent(author.id)}`}
                      className="font-book text-2xl font-semibold text-accent hover:underline"
                    >
                      <bdi>{nameOf(author, language)}</bdi>
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link to={`/books/${encodeURIComponent(book.id)}/edit`} className="btn">
              <Icon name="pencil" className="size-4" />
              {t('common.edit')}
            </Link>
            <ConfirmDelete
              label={t('common.delete')}
              question={t('books.deleteConfirm', { title })}
              onDelete={deleteBook}
              onDeleted={() => navigate('/books', { state: { notice: t('books.deleted', { title }) } })}
            />
          </>
        }
      />
      <Notice className="mt-6" />

      {/* Where you are in it, and reading it: the card the page leads with */}
      <div className="bg-focal mt-9 grid gap-8 rounded-card p-7 shadow-focal lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
        <BookmarkPanel key={book.id} book={book} onMoved={(bookmark) => replace({ ...book, bookmark })} />
        <Reading book={book} onSaved={replace} onStale={reload} />
      </div>

      <BookBenefits bookId={book.id} />

      <CopyDetails rows={details} />

      {book.notes && (
        <section aria-labelledby="notes" className="card mt-5 p-7">
          <h2 id="notes" className="section-title">
            {t('books.fields.notes')}
          </h2>
          <p className="mt-3 max-w-[65ch] break-words whitespace-pre-line" dir="auto">
            {book.notes}
          </p>
        </section>
      )}

      <p className="mt-8">
        <Link to={`/books?work=${encodeURIComponent(book.work.id)}`} className="link text-sm">
          {t('books.allCopies')}
        </Link>
      </p>
    </article>
  )
}

/**
 * What's recorded about the copy: the first four things known, as tiles (where it is on the shelf first), and the
 * whole list behind "All details".
 */
function CopyDetails({ rows }: { rows: DetailRow[] }) {
  const { t } = useTranslation()
  const known = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== '')
  if (known.length === 0) return null

  return (
    <section aria-labelledby="copy" className="card mt-5 p-7">
      <h2 id="copy" className="section-title">
        {t('books.aboutCopy')}
      </h2>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {known.slice(0, 4).map((row) => (
          <div key={row.label} className="min-w-0 rounded-panel bg-field px-4 py-3.5">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className={`mt-1 break-words ${row.book ? 'font-book text-xl' : 'font-medium'}`}>
              {typeof row.value === 'string' ? <bdi>{row.value}</bdi> : row.value}
            </dd>
          </div>
        ))}
      </dl>
      {known.length > 4 && (
        <details className="group mt-5">
          <summary className="btn cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {t('books.allDetails')}
            <Icon name="down" className="size-4 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <Details className="mt-4" rows={known.slice(4)} />
        </details>
      )}
    </section>
  )
}

/** The work's title in the other language, when the copy has no title of its own. */
function otherWorkTitle(book: Edition, language: string): string | null {
  if (!book.work.titleAr || !book.work.titleEn) return null
  return language === 'ar' ? book.work.titleEn : book.work.titleAr
}

function publishedText(book: Edition, t: TFunction, language: string): string | null {
  const { hijri, ce } = book.published
  const parts = [
    hijri !== null ? t('years.hijri', { year: formatNumber(hijri, language) }) : null,
    ce !== null ? t('years.ce', { year: formatNumber(ce, language) }) : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : null
}

/** Not started, reading or finished, with the dates; one button moves it on (starting or finishing today). */
function Reading({ book, onSaved, onStale }: { book: Edition; onSaved: (book: Edition) => void; onStale: () => void }) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const language = i18n.language
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mark(change: { startedOn?: string; finishedOn?: string }) {
    setSaving(true)
    setError(null)
    const result = await putJson<Edition>(
      `/api/v1/editions/${encodeURIComponent(book.id)}`,
      { ...editionInputOf(book), ...change },
      book.version,
    )
    setSaving(false)
    if (result.ok && result.data) onSaved(result.data)
    else if (!result.ok && result.status === 401) void refresh()
    else if (!result.ok) setError(result.code)
  }

  return (
    <section aria-labelledby="reading" className="flex flex-col gap-4 lg:border-s lg:border-white/15 lg:ps-10">
      <h2 id="reading" className="text-sm font-medium text-focal-muted">
        {t('books.reading')}
      </h2>
      <p className="font-display text-2xl font-semibold">{statusText(book.status, t)}</p>
      <dl className="flex flex-col gap-1.5 text-sm">
        {book.startedOn && (
          <div className="flex flex-wrap gap-2">
            <dt className="text-focal-muted">{t('books.fields.startedOn')}</dt>
            <dd>{formatDate(book.startedOn, language)}</dd>
          </div>
        )}
        {book.finishedOn && (
          <div className="flex flex-wrap gap-2">
            <dt className="text-focal-muted">{t('books.fields.finishedOn')}</dt>
            <dd>{formatDate(book.finishedOn, language)}</dd>
          </div>
        )}
      </dl>
      {book.status !== 'finished' && (
        <p className="mt-auto pt-2">
          <button
            type="button"
            className="btn border-white/40 bg-transparent text-focal-ink hover:border-white/70"
            disabled={saving}
            onClick={() => void mark(book.status === 'not_started' ? { startedOn: today() } : { finishedOn: today() })}
          >
            {t(book.status === 'not_started' ? 'books.startToday' : 'books.finishToday')}
          </button>
        </p>
      )}
      {error === 'stale_version' ? (
        <div role="alert" className="rounded-panel bg-surface p-4 text-sm text-danger">
          <p>{t('common.stale')}</p>
          <button type="button" className="btn mt-2" onClick={onStale}>
            {t('common.loadLatest')}
          </button>
        </div>
      ) : (
        error && (
          <p role="alert" className="rounded-panel bg-surface px-4 py-3 text-sm text-danger">
            {errorMessage(t, language, error)}
          </p>
        )
      )}
    </section>
  )
}

/** Where you are in the book. Moving it replaces it; the newest move wins (no version needed). */
function BookmarkPanel({ book, onMoved }: { book: Edition; onMoved: (bookmark: Bookmark | null) => void }) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const language = i18n.language
  const needsVolume = book.volumes === null || book.volumes > 1
  const [volume, setVolume] = useState(book.bookmark?.volume ? String(book.bookmark.volume) : '')
  const [page, setPage] = useState(book.bookmark ? String(book.bookmark.page) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [moved, setMoved] = useState(false)
  const path = `/api/v1/editions/${encodeURIComponent(book.id)}/bookmark`

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setMoved(false)
    const found: Record<string, string> = {}
    const pageNumber = wholeNumber(page, 99999)
    const volumeNumber = needsVolume ? wholeNumber(volume, book.volumes ?? 500) : null
    if (pageNumber === null) found.page = 'required'
    else if (pageNumber === 'invalid') found.page = 'invalid_number'
    if (volumeNumber === 'invalid') found.volume = 'invalid_number'
    else if (volumeNumber === null && book.volumes !== null && book.volumes > 1) found.volume = 'volume_required'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    const result = await putJson<Bookmark>(path, { volume: volumeNumber, page: pageNumber }, null)
    setSaving(false)
    if (result.ok && result.data) {
      onMoved(result.data)
      setMoved(true)
    } else if (!result.ok) {
      if (result.status === 401) void refresh()
      else setErrors(Object.keys(result.fieldErrors).length > 0 ? result.fieldErrors : { page: result.code })
    }
  }

  async function remove() {
    setSaving(true)
    const result = await deleteJson(path)
    setSaving(false)
    if (result.ok || result.status === 404) {
      onMoved(null)
      setVolume('')
      setPage('')
      setMoved(false)
    } else if (result.status === 401) void refresh()
    else setErrors({ page: result.code })
  }

  const field = (key: 'volume' | 'page', value: string, set: (v: string) => void) => (
    <div className="flex w-28 flex-col gap-2">
      <label htmlFor={`bookmark-${key}`} className="text-sm font-medium text-focal-muted">
        {t(`books.bookmark.${key}`)}
      </label>
      <input
        id={`bookmark-${key}`}
        inputMode="numeric"
        dir="ltr"
        maxLength={6}
        value={value}
        onChange={(event) => set(event.target.value)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `bookmark-${key}-error` : undefined}
        className="field-on-focal"
      />
    </div>
  )
  const volumes = book.volumes
  const at = book.bookmark?.volume ?? null

  return (
    <section aria-labelledby="bookmark" className="flex min-w-0 flex-col gap-5">
      <h2
        id="bookmark"
        className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold"
      >
        <Icon name="bookmark" className="size-4" />
        {t('books.bookmark.title')}
      </h2>
      {book.bookmark ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          {/* The page as the one large figure, for the eye; the line beside it says the same in words */}
          <span aria-hidden="true" className="font-display text-figure leading-figure font-semibold">
            {formatNumber(book.bookmark.page, language)}
          </span>
          <p className="pb-3 text-lg text-focal-muted" aria-live="polite">
            {bookmarkText(book.bookmark, t, language)}
            {moved && <span className="sr-only"> {t('books.bookmark.moved')}</span>}
          </p>
        </div>
      ) : (
        <p className="text-lg text-focal-muted" aria-live="polite">
          {t('books.bookmark.none')}
        </p>
      )}
      {at !== null && volumes !== null && volumes > 1 && <VolumeRuler at={at} of={volumes} />}
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-wrap items-end gap-3">
        {needsVolume && field('volume', volume, setVolume)}
        {field('page', page, setPage)}
        <button
          type="submit"
          className="btn border-transparent bg-focal-ink text-focal-deep hover:border-transparent hover:opacity-90"
          disabled={saving}
        >
          {t(book.bookmark ? 'books.bookmark.move' : 'books.bookmark.put')}
        </button>
        {book.bookmark && (
          <button
            type="button"
            className="btn border-transparent bg-transparent text-focal-ink hover:bg-white/10"
            disabled={saving}
            onClick={() => void remove()}
          >
            {t('books.bookmark.remove')}
          </button>
        )}
      </form>
      {(['volume', 'page'] as const).map(
        (key) =>
          errors[key] && (
            <p
              key={key}
              id={`bookmark-${key}-error`}
              className="self-start rounded-panel bg-surface px-4 py-2.5 text-sm text-danger"
            >
              {errorMessage(t, language, errors[key])}
            </p>
          ),
      )}
    </section>
  )
}

/** One mark per volume, filled up to the one the bookmark is in; a plain bar when there are too many to tell apart */
function VolumeRuler({ at, of }: { at: number; of: number }) {
  if (of > 24) {
    return (
      <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-white/15">
        <span className="block h-full rounded-full bg-focal-fill" style={{ width: `${(at / of) * 100}%` }} />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="grid items-end gap-1.5"
      style={{ gridTemplateColumns: `repeat(${of}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`block rounded-full ${
            i + 1 === at ? 'h-4.5 bg-focal-mark' : i + 1 < at ? 'h-2 bg-focal-fill' : 'h-2 bg-white/15'
          }`}
        />
      ))}
    </span>
  )
}

const BOOK_BENEFITS = 5

/** The newest benefits saved from this book, and the way to add one or see them all. */
function BookBenefits({ bookId }: { bookId: string }) {
  const { t, i18n } = useTranslation()
  const [loaded, { reload }] = useLoad<BenefitPage>(
    `/api/v1/benefits?page=0&size=${BOOK_BENEFITS}&editionId=${encodeURIComponent(bookId)}`,
  )
  const benefits = loaded.status === 'ok' ? loaded.data : null

  return (
    <section aria-labelledby="book-benefits" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 id="book-benefits" className="section-title text-xl">
          {t('benefits.fromThisBook')}
          {benefits && benefits.total > 0 && (
            <span className="ms-2 text-base font-normal text-muted">{formatNumber(benefits.total, i18n.language)}</span>
          )}
        </h2>
        <Link to={`/benefits/new?book=${encodeURIComponent(bookId)}`} className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          {t('benefits.add')}
        </Link>
      </div>
      {benefits && benefits.total === 0 && <p className="mt-3 text-muted">{t('benefits.noneFromBook')}</p>}
      {benefits && benefits.total > 0 && (
        <>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {benefits.items.map((benefit) => (
              <li key={benefit.id} className="card px-6 py-1">
                <BenefitCard benefit={benefit} withoutBook onDeleted={reload} />
              </li>
            ))}
          </ul>
          {benefits.total > benefits.items.length && (
            <p className="mt-4">
              <Link to={`/benefits?book=${encodeURIComponent(bookId)}`} className="link text-sm">
                {t('benefits.allFromBook', { number: formatNumber(benefits.total, i18n.language) })}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
