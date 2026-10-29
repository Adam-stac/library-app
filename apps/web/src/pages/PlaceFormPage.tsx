import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { postJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import FormField from '../components/FormField'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import TextAreaField from '../components/TextAreaField'
import UnsavedChanges from '../components/UnsavedChanges'
import { useFormChecks } from '../formChecks'
import { decimal, errorMessage, nameOf, orNull, type Place } from '../library'
import { useLoad } from '../useLoad'

const MAX_OTHER_NAMES = 10

type Draft = {
  nameAr: string
  nameEn: string
  otherNames: string
  countryAr: string
  countryEn: string
  latitude: string
  longitude: string
}

const EMPTY: Draft = {
  nameAr: '',
  nameEn: '',
  otherNames: '',
  countryAr: '',
  countryEn: '',
  latitude: '',
  longitude: '',
}

function draftFrom(place: Place): Draft {
  return {
    nameAr: place.nameAr ?? '',
    nameEn: place.nameEn ?? '',
    otherNames: place.otherNames.join('\n'),
    countryAr: place.countryAr ?? '',
    countryEn: place.countryEn ?? '',
    latitude: place.latitude === null ? '' : String(place.latitude),
    longitude: place.longitude === null ? '' : String(place.longitude),
  }
}

/**
 * Adding a place, or editing one of the account's own (`/places/:id/edit`). Places on the shared list can't be
 * edited. The API has the final say on every rule.
 */
export default function PlaceFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { reload }] = useLoad<Place>(mode === 'edit' ? `/api/v1/places/${encodeURIComponent(id)}` : null)
  const editing = mode === 'edit' && loaded.status === 'ok' ? loaded.data : null
  // What has been typed, kept against the version it started from: when the place arrives, or the latest version
  // is loaded after a clash, the form starts again from it
  const base = editing ? `${editing.id}:${editing.version}` : 'new'
  const [typed, setTyped] = useState<{ base: string; draft: Draft } | null>(null)
  const draft = typed?.base === base ? typed.draft : editing ? draftFrom(editing) : EMPTY
  const setDraft = (next: Draft) => setTyped({ base, draft: next })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const checks = useFormChecks(setErrors)

  function loadLatest() {
    setErrors({})
    setFormError(null)
    reload()
  }

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const back = editing
    ? { to: `/places/${encodeURIComponent(editing.id)}`, label: nameOf(editing, language) }
    : { to: '/places', label: t('places.all') }

  if (mode === 'edit' && loaded.status !== 'ok') {
    if (loaded.status === 'loading') return <Loading />
    return (
      <section className="max-w-2xl">
        <PageHeader back={{ to: '/places', label: t('places.all') }} title={t('places.title')} />
        <p role="alert" className="mt-6 text-danger">
          {t(loaded.status === 'notFound' ? 'places.notFound' : 'common.loadFailed')}
        </p>
      </section>
    )
  }
  if (editing?.shared) {
    return (
      <section className="max-w-2xl">
        <PageHeader back={back} title={t('places.editTitle', { name: nameOf(editing, language) })} />
        <p role="alert" className="mt-6 text-danger">
          {t('errors.read_only')}
        </p>
      </section>
    )
  }

  const set = (field: keyof Draft) => (value: string) => setDraft({ ...draft, [field]: value })
  const message = (code: string | undefined) => (code ? errorMessage(t, language, code) : undefined)

  const otherNamesOf = (text: string) =>
    text
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name !== '')

  /** What is wrong with the form as it stands, by field: checked on saving, and as each field is left */
  function problems(): Record<string, string> {
    const otherNames = otherNamesOf(draft.otherNames)
    const latitude = decimal(draft.latitude)
    const longitude = decimal(draft.longitude)
    const found: Record<string, string> = {}
    if (draft.nameAr.trim() === '' && draft.nameEn.trim() === '') found.nameAr = 'name_required'
    if (otherNames.length > MAX_OTHER_NAMES) found.otherNames = 'too_many'
    if (latitude === 'invalid' || (latitude !== null && Math.abs(latitude) > 90)) found.latitude = 'invalid_coordinate'
    if (longitude === 'invalid' || (longitude !== null && Math.abs(longitude) > 180)) {
      found.longitude = 'invalid_coordinate'
    }
    if (!found.latitude && !found.longitude && (latitude === null) !== (longitude === null)) {
      found[latitude === null ? 'latitude' : 'longitude'] = 'coordinates_incomplete'
    }
    return found
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const found = problems()
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const otherNames = otherNamesOf(draft.otherNames)
    const latitude = decimal(draft.latitude)
    const longitude = decimal(draft.longitude)

    const body = {
      nameAr: orNull(draft.nameAr),
      nameEn: orNull(draft.nameEn),
      otherNames,
      countryAr: orNull(draft.countryAr),
      countryEn: orNull(draft.countryEn),
      latitude,
      longitude,
    }
    setSaving(true)
    const result = editing
      ? await putJson<Place>(`/api/v1/places/${encodeURIComponent(editing.id)}`, body, editing.version)
      : await postJson<Place>('/api/v1/places', body, { csrf: true })
    setSaving(false)
    if (result.ok && result.data) {
      navigate(`/places/${encodeURIComponent(result.data.id)}`, {
        state: { notice: t(editing ? 'common.saved' : 'places.added') },
      })
    } else if (!result.ok) {
      if (result.status === 401) void refresh()
      else if (Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
      else setFormError(result.code)
    }
  }

  return (
    <section className="max-w-2xl">
      <PageHeader
        back={back}
        title={<bdi>{editing ? t('places.editTitle', { name: nameOf(editing, language) }) : t('places.addTitle')}</bdi>}
      />

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
            {message(formError)}
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
        <FormField
          id="nameAr"
          label={t('places.form.nameAr')}
          hint={t('places.form.namesHint')}
          value={draft.nameAr}
          onChange={set('nameAr')}
          error={errors.nameAr}
          maxLength={200}
          dir="auto"
          book
        />
        <FormField
          id="nameEn"
          label={t('places.form.nameEn')}
          value={draft.nameEn}
          onChange={set('nameEn')}
          error={errors.nameEn}
          maxLength={200}
          dir="auto"
          book
        />
        <TextAreaField
          id="otherNames"
          label={t('places.form.otherNames')}
          hint={t('places.form.otherNamesHint')}
          value={draft.otherNames}
          onChange={set('otherNames')}
          error={errors.otherNames}
          maxLength={2200}
          rows={3}
          book
        />
        <div className="grid gap-7 sm:grid-cols-2">
          <FormField
            id="countryAr"
            label={t('places.form.countryAr')}
            value={draft.countryAr}
            onChange={set('countryAr')}
            error={errors.countryAr}
            maxLength={100}
            dir="auto"
            book
          />
          <FormField
            id="countryEn"
            label={t('places.form.countryEn')}
            value={draft.countryEn}
            onChange={set('countryEn')}
            error={errors.countryEn}
            maxLength={100}
            dir="auto"
            book
          />
        </div>
        <fieldset className="card p-5 sm:p-6">
          <legend className="section-title float-start mb-2 w-full">{t('places.position')}</legend>
          <p className="clear-both mb-5 text-sm text-muted">{t('places.form.positionHint')}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="latitude"
              label={t('places.form.latitude')}
              value={draft.latitude}
              onChange={set('latitude')}
              error={errors.latitude}
              maxLength={20}
            />
            <FormField
              id="longitude"
              label={t('places.form.longitude')}
              value={draft.longitude}
              onChange={set('longitude')}
              error={errors.longitude}
              maxLength={20}
            />
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
