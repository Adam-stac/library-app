import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { postJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import FormField from '../components/FormField'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import SearchPicker, { Picked } from '../components/SearchPicker'
import TextAreaField from '../components/TextAreaField'
import UnsavedChanges from '../components/UnsavedChanges'
import { useFormChecks } from '../formChecks'
import {
  authorsOf,
  type Benefit,
  bookTitle,
  type Edition,
  type EditionReference,
  errorMessage,
  wholeNumber,
} from '../library'
import { useLoad } from '../useLoad'

type Draft = { text: string; edition: EditionReference | null; volume: string; page: string }

const MAX_TEXT = 5000

/**
 * Saving a benefit, or editing one (`/benefits/:id/edit`): the text, and optionally the book it came from, with the
 * volume and page. `?book=` starts a new one from that book. The API has the final say on every rule.
 */
export default function BenefitFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const bookId = mode === 'add' ? searchParams.get('book') : null
  const [benefit, { reload }] = useLoad<Benefit>(mode === 'edit' ? `/api/v1/benefits/${encodeURIComponent(id)}` : null)
  const [startingBook] = useLoad<Edition>(bookId ? `/api/v1/editions/${encodeURIComponent(bookId)}` : null)
  const editing = mode === 'edit' && benefit.status === 'ok' ? benefit.data : null

  // What has been typed, kept against what it started from (see PlaceFormPage). A new benefit started from a book
  // keeps what was typed when the book arrives: the book only fills in the book, unless one has been chosen since.
  const startingEdition = startingBook.status === 'ok' ? startingBook.data : null
  const base = editing ? `${editing.id}:${editing.version}` : 'new'
  const initial: Draft = editing
    ? {
        text: editing.text,
        edition: editing.edition,
        volume: editing.volume === null ? '' : String(editing.volume),
        page: editing.page === null ? '' : String(editing.page),
      }
    : { text: '', edition: startingEdition, volume: '', page: '' }
  const [typed, setTyped] = useState<{ base: string; draft: Draft; bookChosen: boolean } | null>(null)
  const draft =
    typed?.base === base
      ? editing || typed.bookChosen
        ? typed.draft
        : { ...typed.draft, edition: startingEdition }
      : initial
  const setDraft = (next: Draft, bookChosen = typed?.base === base && typed.bookChosen) =>
    setTyped({ base, draft: next, bookChosen })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const checks = useFormChecks(setErrors)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />
  if (mode === 'edit' && !editing) {
    if (benefit.status === 'loading') return <Loading />
    return (
      <section className="max-w-2xl">
        <PageHeader back={{ to: '/benefits', label: t('benefits.all') }} title={t('benefits.editTitle')} />
        <p role="alert" className="mt-6 text-danger">
          {t(benefit.status === 'notFound' ? 'benefits.notFound' : 'common.loadFailed')}
        </p>
      </section>
    )
  }

  const volumes = draft.edition?.volumes ?? null
  const needsVolume = draft.edition !== null && (volumes === null || volumes > 1)
  const back =
    draft.edition && bookId
      ? { to: `/books/${encodeURIComponent(draft.edition.id)}`, label: bookTitle(draft.edition, language) }
      : { to: '/benefits', label: t('benefits.all') }

  function loadLatest() {
    setErrors({})
    setFormError(null)
    reload()
  }

  /** What is wrong with the form as it stands, by field: checked on saving, and as each field is left */
  function problems(): Record<string, string> {
    const found: Record<string, string> = {}
    if (draft.text.trim() === '') found.text = 'required'
    else if (draft.text.length > MAX_TEXT) found.text = 'too_long'
    const volume = needsVolume ? wholeNumber(draft.volume, volumes ?? 500) : null
    const page = draft.edition ? wholeNumber(draft.page, 99999) : null
    if (volume === 'invalid') found.volume = 'invalid_number'
    if (page === 'invalid') found.page = 'invalid_number'
    if (volume === null && page !== null && page !== 'invalid' && volumes !== null && volumes > 1) {
      found.volume = 'volume_required'
    }
    return found
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const found = problems()
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const volume = needsVolume ? wholeNumber(draft.volume, volumes ?? 500) : null
    const page = draft.edition ? wholeNumber(draft.page, 99999) : null

    const body = {
      text: draft.text,
      editionId: draft.edition?.id ?? null,
      volume: volume === 'invalid' ? null : volume,
      page: page === 'invalid' ? null : page,
    }
    setSaving(true)
    const result = editing
      ? await putJson<Benefit>(`/api/v1/benefits/${encodeURIComponent(editing.id)}`, body, editing.version)
      : await postJson<Benefit>('/api/v1/benefits', body, { csrf: true })
    setSaving(false)
    if (result.ok && result.data) {
      const notice = t(editing ? 'common.saved' : 'benefits.added')
      // Back to the book it came from when started from one; otherwise to the benefit itself
      if (bookId && result.data.edition) {
        navigate(`/books/${encodeURIComponent(result.data.edition.id)}`, { state: { notice } })
      } else {
        navigate(`/benefits/${encodeURIComponent(result.data.id)}`, { state: { notice } })
      }
    } else if (!result.ok) {
      if (result.status === 401) void refresh()
      else if (Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
      else setFormError(result.code)
    }
  }

  return (
    <section className="max-w-2xl">
      <PageHeader back={back} title={t(editing ? 'benefits.editTitle' : 'benefits.addTitle')} />

      {formError === 'stale_version' ? (
        <div role="alert" className="mt-6 rounded-xl border border-danger-line bg-danger-soft p-5">
          <p>{t('common.stale')}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={loadLatest}>
            {t('common.loadLatest')}
          </button>
        </div>
      ) : (
        formError && (
          <p role="alert" className="mt-6 text-danger">
            {errorMessage(t, language, formError)}
          </p>
        )
      )}

      <UnsavedChanges when={checks.dirty && !saving} />
      <form
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        {...checks.formProps(problems)}
        className="mt-10 flex flex-col gap-7"
      >
        <TextAreaField
          id="text"
          label={t('benefits.form.text')}
          hint={t('benefits.form.textHint')}
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          error={errors.text}
          maxLength={MAX_TEXT}
          rows={7}
          book
        />

        <fieldset className="card p-5 sm:p-6">
          <legend className="section-title float-start mb-2 w-full">{t('benefits.form.source')}</legend>
          <div className="clear-both flex flex-col gap-5 pt-3">
            <p className="-mt-3 text-sm text-muted">{t('benefits.form.sourceHint')}</p>
            {draft.edition ? (
              <div className="flex flex-col gap-2">
                <span id="book-label" className="label">
                  {t('benefits.form.book')}
                </span>
                <p role="group" aria-labelledby="book-label">
                  <Picked
                    label={bookTitle(draft.edition, language)}
                    secondary={authorsOf(draft.edition.work, language) || null}
                    onRemove={() => setDraft({ ...draft, edition: null, volume: '', page: '' }, true)}
                  />
                </p>
                {errors.editionId && (
                  <p className="text-sm text-danger">{errorMessage(t, language, errors.editionId)}</p>
                )}
              </div>
            ) : (
              <SearchPicker<EditionReference>
                id="book"
                label={t('benefits.form.book')}
                hint={t('benefits.form.bookHint')}
                error={errors.editionId ? errorMessage(t, language, errors.editionId) : null}
                kind="editions"
                describe={(found) => ({
                  primary: bookTitle(found, language),
                  secondary: authorsOf(found.work, language) || null,
                })}
                onPick={(edition) => setDraft({ ...draft, edition }, true)}
              />
            )}
            {draft.edition && (
              <div className="grid gap-5 sm:grid-cols-2">
                {needsVolume && (
                  <FormField
                    id="volume"
                    label={t('books.bookmark.volume')}
                    value={draft.volume}
                    onChange={(volume) => setDraft({ ...draft, volume })}
                    error={errors.volume}
                    maxLength={6}
                  />
                )}
                <FormField
                  id="page"
                  label={t('books.bookmark.page')}
                  value={draft.page}
                  onChange={(page) => setDraft({ ...draft, page })}
                  error={errors.page}
                  maxLength={6}
                />
              </div>
            )}
          </div>
        </fieldset>

        <p>
          <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
            {t('common.save')}
          </button>
        </p>
      </form>
    </section>
  )
}
