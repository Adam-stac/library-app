import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { getJson, postJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import { type Author, displayName } from '../authors'
import FormField from '../components/FormField'
import TextAreaField from '../components/TextAreaField'
import YearFields from '../components/YearFields'
import { draftOf, EMPTY_YEAR, type YearDraft, yearOf } from '../yearDraft'

const button =
  'min-h-11 rounded-full px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'
const primary = `${button} bg-stone-900 text-white hover:bg-stone-700`

type TextFields = {
  nameAr: string
  nameEn: string
  fullName: string
  ism: string
  kunya: string
  laqab: string
  nisba: string
  biography: string
}

type Draft = TextFields & { birth: YearDraft; death: YearDraft }

const EMPTY: Draft = {
  nameAr: '',
  nameEn: '',
  fullName: '',
  ism: '',
  kunya: '',
  laqab: '',
  nisba: '',
  biography: '',
  birth: EMPTY_YEAR,
  death: EMPTY_YEAR,
}

function draftFrom(author: Author): Draft {
  return {
    nameAr: author.nameAr ?? '',
    nameEn: author.nameEn ?? '',
    fullName: author.fullName ?? '',
    ism: author.ism ?? '',
    kunya: author.kunya ?? '',
    laqab: author.laqab ?? '',
    nisba: author.nisba ?? '',
    biography: author.biography ?? '',
    birth: draftOf(author.birth),
    death: draftOf(author.death),
  }
}

const orNull = (text: string) => (text.trim() === '' ? null : text)

/** Adding an author, or editing one (`/authors/:id/edit`). The API has the final say on every rule. */
export default function AuthorFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<Author | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [moreNamesOpen, setMoreNamesOpen] = useState(false)
  const showAuthor = useCallback((author: Author) => {
    setEditing(author)
    setDraft(draftFrom(author))
    if (author.fullName || author.ism || author.kunya || author.laqab || author.nisba) setMoreNamesOpen(true)
  }, [])

  const load = useCallback(async () => {
    const response = await getJson<Author>(`/api/v1/authors/${encodeURIComponent(id)}`)
    if (response.ok && response.data) {
      showAuthor(response.data)
      setErrors({})
      setFormError(null)
    } else if (response.status === 401) {
      void refresh()
    } else {
      setLoadError(response.status === 404 || response.status === 400 ? 'notFound' : 'loadFailed')
    }
  }, [id, refresh, showAuthor])

  useEffect(() => {
    if (mode !== 'edit' || state.status !== 'signedIn') return
    let current = true
    void getJson<Author>(`/api/v1/authors/${encodeURIComponent(id)}`).then((response) => {
      if (!current) return
      if (response.ok && response.data) {
        showAuthor(response.data)
      } else if (response.status === 401) {
        void refresh()
      } else {
        setLoadError(response.status === 404 || response.status === 400 ? 'notFound' : 'loadFailed')
      }
    })
    return () => {
      current = false
    }
  }, [mode, state.status, id, refresh, showAuthor])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const setText = (field: keyof TextFields) => (value: string) => setDraft({ ...draft, [field]: value })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const birth = yearOf(draft.birth)
    const death = yearOf(draft.death)
    const found: Record<string, string> = {}
    if (draft.nameAr.trim() === '' && draft.nameEn.trim() === '') found.nameAr = 'name_required'
    if (birth.errors.hijri) found['birth.hijri'] = birth.errors.hijri
    if (birth.errors.ce) found['birth.ce'] = birth.errors.ce
    if (death.errors.hijri) found['death.hijri'] = death.errors.hijri
    if (death.errors.ce) found['death.ce'] = death.errors.ce
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const body = {
      nameAr: orNull(draft.nameAr),
      nameEn: orNull(draft.nameEn),
      fullName: orNull(draft.fullName),
      ism: orNull(draft.ism),
      kunya: orNull(draft.kunya),
      laqab: orNull(draft.laqab),
      nisba: orNull(draft.nisba),
      birth: birth.year,
      death: death.year,
      // Places can't be chosen on this page yet; an edit keeps the ones the author already has
      birthPlaceId: editing?.birthPlace?.id ?? null,
      deathPlaceId: editing?.deathPlace?.id ?? null,
      biography: orNull(draft.biography),
    }
    setSaving(true)
    const result =
      mode === 'edit' && editing
        ? await putJson<Author>(`/api/v1/authors/${encodeURIComponent(editing.id)}`, body, editing.version)
        : await postJson<Author>('/api/v1/authors', body, { csrf: true })
    setSaving(false)
    if (result.ok && result.data) {
      navigate(`/authors/${encodeURIComponent(result.data.id)}`, {
        state: { notice: t(mode === 'edit' ? 'authors.saved' : 'authors.added') },
      })
    } else if (!result.ok) {
      if (result.status === 401) void refresh()
      else if (Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
      else setFormError(result.code)
    }
  }

  if (mode === 'edit' && loadError) {
    return (
      <section className="max-w-2xl">
        <p role="alert" className="text-red-800">
          {t(`authors.${loadError}`)}
        </p>
        <p className="mt-4">
          <Link to="/authors" className="font-semibold underline underline-offset-4">
            {t('authors.all')}
          </Link>
        </p>
      </section>
    )
  }
  if (mode === 'edit' && !editing) return null

  const title = editing ? t('authors.editTitle', { name: displayName(editing, language) }) : t('authors.addTitle')

  return (
    <section className="max-w-2xl">
      <p>
        <Link
          to={editing ? `/authors/${encodeURIComponent(editing.id)}` : '/authors'}
          className="font-semibold underline underline-offset-4"
        >
          {editing ? displayName(editing, language) : t('authors.all')}
        </Link>
      </p>
      <h1 className="mt-6 text-3xl font-semibold break-words">
        <bdi>{title}</bdi>
      </h1>

      {formError === 'stale_version' ? (
        <div role="alert" className="mt-6 rounded-lg border border-red-300 bg-white p-4">
          <p>{t('authors.stale')}</p>
          <button type="button" className={`${primary} mt-4`} onClick={() => void load()}>
            {t('authors.loadLatest')}
          </button>
        </div>
      ) : (
        formError && (
          <p role="alert" className="mt-6 text-red-800">
            {t(`errors.${formError}`, { defaultValue: t('errors.unexpected') })}
          </p>
        )
      )}

      <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-8 flex flex-col gap-6">
        <FormField
          id="nameAr"
          label={t('authors.form.nameAr')}
          hint={t('authors.form.namesHint')}
          value={draft.nameAr}
          onChange={setText('nameAr')}
          error={errors.nameAr}
          maxLength={200}
          dir="auto"
        />
        <FormField
          id="nameEn"
          label={t('authors.form.nameEn')}
          value={draft.nameEn}
          onChange={setText('nameEn')}
          error={errors.nameEn}
          maxLength={200}
          dir="auto"
        />

        <details
          open={moreNamesOpen}
          onToggle={(e) => setMoreNamesOpen(e.currentTarget.open)}
          className="rounded-lg border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">{t('authors.form.moreNames')}</summary>
          <div className="mt-4 flex flex-col gap-4">
            <FormField
              id="fullName"
              label={t('authors.form.fullName')}
              value={draft.fullName}
              onChange={setText('fullName')}
              error={errors.fullName}
              maxLength={500}
              dir="auto"
            />
            {(['ism', 'kunya', 'laqab', 'nisba'] as const).map((field) => (
              <FormField
                key={field}
                id={field}
                label={t(`authors.form.${field}`)}
                value={draft[field]}
                onChange={setText(field)}
                error={errors[field]}
                maxLength={200}
                dir="auto"
              />
            ))}
          </div>
        </details>

        <YearFields
          kind="birth"
          value={draft.birth}
          onChange={(birth) => setDraft({ ...draft, birth })}
          errors={{ hijri: errors['birth.hijri'], ce: errors['birth.ce'] }}
        />
        <YearFields
          kind="death"
          value={draft.death}
          onChange={(death) => setDraft({ ...draft, death })}
          errors={{ hijri: errors['death.hijri'], ce: errors['death.ce'] }}
        />

        <TextAreaField
          id="biography"
          label={t('authors.form.biography')}
          hint={t('authors.form.biographyHint')}
          value={draft.biography}
          onChange={setText('biography')}
          error={errors.biography}
          maxLength={10000}
        />

        <p>
          <button type="submit" className={primary} disabled={saving}>
            {t('authors.save')}
          </button>
        </p>
      </form>
    </section>
  )
}
