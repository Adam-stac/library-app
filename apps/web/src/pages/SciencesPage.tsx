import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { type ApiResult, deleteJson, postJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import ConfirmDelete from '../components/ConfirmDelete'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import { errorMessage, nameOf, orNull, otherNameOf, type Science, type ScienceList } from '../library'
import { useLoad } from '../useLoad'

type Names = { nameAr: string; nameEn: string }

/**
 * The account's sciences (فنون), the flat list a work is filed under: adding, renaming and deleting, all on one
 * page. Every account starts with a list it can change freely. A science that books still use can't be deleted.
 */
export default function SciencesPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { reload }] = useLoad<ScienceList>(`/api/v1/sciences?sort=${language}`)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const sciences = loaded.status === 'ok' ? loaded.data : null
  const done = (message: string) => {
    setNotice(message)
    setRenaming(null)
    reload()
  }

  return (
    <section className="max-w-3xl">
      <PageHeader title={t('sciences.title')} lede={t('sciences.intro')} />

      <AddScience onAdded={(name) => done(t('sciences.added', { name }))} />

      {notice && (
        <p role="status" className="notice mt-8">
          <Icon name="check" className="mt-px size-4 text-accent" />
          {notice}
        </p>
      )}
      {loaded.status === 'loading' && <Loading shape="list" className="mt-8" />}
      {loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {sciences && sciences.total === 0 && <EmptyState text={t('sciences.none')} />}
      {sciences && sciences.total > 0 && (
        <>
          <p className="mt-10 mb-2 text-sm text-muted">
            {t('sciences.count', { count: sciences.total, number: formatNumber(sciences.total, language) })}
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {sciences.items.map((science) =>
              renaming === science.id ? (
                <li key={science.id} className="py-4">
                  <RenameScience
                    science={science}
                    onCancel={() => setRenaming(null)}
                    onSaved={() => done(t('common.saved'))}
                    onStale={reload}
                  />
                </li>
              ) : (
                <li key={science.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                    <bdi className="font-book text-xl leading-snug font-medium">{nameOf(science, language)}</bdi>
                    {otherNameOf(science, language) && (
                      <bdi className="font-book text-sm text-muted">{otherNameOf(science, language)}</bdi>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-1 has-[>div]:basis-full">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`${t('sciences.rename')} ${nameOf(science, language)}`}
                      onClick={() => {
                        setNotice(null)
                        setRenaming(science.id)
                      }}
                    >
                      <Icon name="pencil" className="size-4" />
                      {t('sciences.rename')}
                    </button>
                    <ConfirmDelete
                      label={t('common.delete')}
                      hiddenName={nameOf(science, language)}
                      question={t('sciences.deleteConfirm', { name: nameOf(science, language) })}
                      onDelete={() => deleteJson(`/api/v1/sciences/${encodeURIComponent(science.id)}`)}
                      onDeleted={() => done(t('sciences.deleted', { name: nameOf(science, language) }))}
                    />
                  </span>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </section>
  )
}

/** The two names of a science, side by side; errors are codes from the API or from the checks here. */
function NameFields({
  prefix,
  names,
  onChange,
  errors,
}: {
  prefix: string
  names: Names
  onChange: (names: Names) => void
  errors: Record<string, string>
}) {
  const { t } = useTranslation()
  const field = (key: keyof Names) => {
    const id = `${prefix}-${key}`
    return (
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
        <label htmlFor={id} className="label">
          {t(`sciences.form.${key}`)}
        </label>
        <input
          id={id}
          dir="auto"
          maxLength={100}
          value={names[key]}
          onChange={(event) => onChange({ ...names, [key]: event.target.value })}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
          className="field font-book"
        />
        {errors[key] && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {t(`errors.${errors[key]}`, { defaultValue: t('errors.unexpected') })}
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-4">
      {field('nameAr')}
      {field('nameEn')}
    </div>
  )
}

function useSave() {
  const { refresh } = useAuth()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(names: Names, send: (body: unknown) => Promise<ApiResult<Science>>) {
    setFormError(null)
    if (names.nameAr.trim() === '' && names.nameEn.trim() === '') {
      setErrors({ nameAr: 'name_required' })
      return null
    }
    setErrors({})
    setSaving(true)
    const result = await send({ nameAr: orNull(names.nameAr), nameEn: orNull(names.nameEn) })
    setSaving(false)
    if (result.ok) return result.data
    if (result.status === 401) void refresh()
    else if (Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
    else setFormError(result.code)
    return null
  }

  return { errors, formError, saving, save }
}

function AddScience({ onAdded }: { onAdded: (name: string) => void }) {
  const { t, i18n } = useTranslation()
  const [names, setNames] = useState<Names>({ nameAr: '', nameEn: '' })
  const { errors, formError, saving, save } = useSave()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const science = await save(names, (body) => postJson<Science>('/api/v1/sciences', body, { csrf: true }))
    if (science) {
      setNames({ nameAr: '', nameEn: '' })
      onAdded(nameOf(science, i18n.language))
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-labelledby="add-science"
      className="card mt-10 flex flex-col gap-4 p-5"
    >
      <h2 id="add-science" className="section-title">
        {t('sciences.add')}
      </h2>
      <NameFields prefix="new" names={names} onChange={setNames} errors={errors} />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(t, i18n.language, formError)}
        </p>
      )}
      <p>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
          <Icon name="plus" className="size-4" />
          {t('sciences.addButton')}
        </button>
      </p>
    </form>
  )
}

function RenameScience({
  science,
  onCancel,
  onSaved,
  onStale,
}: {
  science: Science
  onCancel: () => void
  onSaved: () => void
  onStale: () => void
}) {
  const { t, i18n } = useTranslation()
  const [names, setNames] = useState<Names>({ nameAr: science.nameAr ?? '', nameEn: science.nameEn ?? '' })
  const { errors, formError, saving, save } = useSave()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const saved = await save(names, (body) =>
      putJson<Science>(`/api/v1/sciences/${encodeURIComponent(science.id)}`, body, science.version),
    )
    if (saved) onSaved()
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-label={t('sciences.renameNamed', { name: nameOf(science, i18n.language) })}
      className="flex flex-col gap-4"
    >
      <NameFields prefix={science.id} names={names} onChange={setNames} errors={errors} />
      {formError === 'stale_version' ? (
        <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm">
          <p>{t('common.stale')}</p>
          <button type="button" className="btn mt-3" onClick={onStale}>
            {t('common.loadLatest')}
          </button>
        </div>
      ) : (
        formError && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(t, i18n.language, formError)}
          </p>
        )
      )}
      <p className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
          {t('common.save')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </p>
    </form>
  )
}
