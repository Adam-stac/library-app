import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { type ApiResult, getJson, postJson } from '../api'
import { useAuth } from '../auth/context'
import FormField from '../components/FormField'
import { addPasskey, type Passkey, passkeysSupported } from '../passkeys'

const button =
  'min-h-11 rounded-full px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'
const primary = `${button} bg-stone-900 text-white hover:bg-stone-700`
const secondary = `${button} border border-stone-900 hover:bg-stone-100`

/** Adding and removing passkeys. Signed-in accounts only; every change needs the password again. */
export default function PasskeysPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [canUsePasskeys] = useState(passkeysSupported)

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void getJson<Passkey[]>('/api/v1/auth/passkeys').then((result) => {
      if (!current) return
      if (result.ok && result.data) setPasskeys(result.data)
      else if (result.status === 401) void refresh()
    })
    return () => {
      current = false
    }
  }, [state.status, refresh])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  async function reload(message: string) {
    const result = await getJson<Passkey[]>('/api/v1/auth/passkeys')
    if (result.ok && result.data) setPasskeys(result.data)
    setAdding(false)
    setRemoving(null)
    setNotice(message)
  }

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium' }).format(new Date(iso))

  return (
    <section className="max-w-xl">
      <h1 className="text-3xl font-semibold">{t('passkeys.title')}</h1>
      <p className="mt-3 text-stone-700">{t('passkeys.intro')}</p>

      {notice && (
        <p role="status" className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">
          {notice}
        </p>
      )}

      {!canUsePasskeys && (
        <p className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">{t('passkeys.unsupported')}</p>
      )}

      {passkeys && (
        <>
          <h2 className="mt-8 text-lg font-semibold">{t('passkeys.yours')}</h2>
          {passkeys.length === 0 ? (
            <p className="mt-2 text-stone-700">{t('passkeys.none')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {passkeys.map((passkey) => (
                <li key={passkey.id} className="rounded-lg border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{passkey.label}</p>
                      <p className="text-sm text-stone-700">
                        {t('passkeys.added', { date: date(passkey.createdAt) })}
                        {' · '}
                        {passkey.lastUsedAt ? t('passkeys.lastUsed', { date: date(passkey.lastUsedAt) }) : t('passkeys.neverUsed')}
                      </p>
                    </div>
                    {removing !== passkey.id && (
                      <button
                        type="button"
                        className={secondary}
                        onClick={() => {
                          setNotice(null)
                          setAdding(false)
                          setRemoving(passkey.id)
                        }}
                        aria-label={t('passkeys.removeNamed', { label: passkey.label })}
                      >
                        {t('passkeys.remove')}
                      </button>
                    )}
                  </div>
                  {removing === passkey.id && (
                    <PasswordForm
                      intro={t('passkeys.removeBody', { label: passkey.label })}
                      submitLabel={t('passkeys.remove')}
                      onCancel={() => setRemoving(null)}
                      send={async (currentPassword) => {
                        const result = await postJson(
                          `/api/v1/auth/passkeys/${encodeURIComponent(passkey.id)}/delete`,
                          { currentPassword },
                          { csrf: true },
                        )
                        if (result.ok) await reload(t('passkeys.removed', { label: passkey.label }))
                        else if (result.status === 401) void refresh()
                        return result
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {canUsePasskeys && passkeys && !adding && (
        <p className="mt-8">
          <button
            type="button"
            className={primary}
            onClick={() => {
              setNotice(null)
              setRemoving(null)
              setAdding(true)
            }}
          >
            {t('passkeys.add')}
          </button>
        </p>
      )}

      {adding && (
        <div className="mt-8 rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">{t('passkeys.addTitle')}</h2>
          <PasswordForm
            withLabel
            intro={t('passkeys.addBody')}
            submitLabel={t('passkeys.addSubmit')}
            onCancel={() => setAdding(false)}
            send={async (currentPassword, label) => {
              const result = await addPasskey(currentPassword, label)
              if (result.ok) await reload(t('passkeys.addedNotice', { label }))
              else if (result.status === 401) void refresh()
              return result
            }}
          />
        </div>
      )}
    </section>
  )
}

/** Asks for the password again (and a name, when adding a passkey). */
function PasswordForm({
  withLabel = false,
  intro,
  submitLabel,
  onCancel,
  send,
}: {
  withLabel?: boolean
  intro: string
  submitLabel: string
  onCancel: () => void
  send: (currentPassword: string, label: string) => Promise<ApiResult<unknown>>
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    const local: Record<string, string> = {}
    if (withLabel && !label.trim()) local.label = 'required'
    if (!currentPassword) local.currentPassword = 'required'
    setErrors(local)
    if (local.label) return labelRef.current?.focus()
    if (local.currentPassword) return passwordRef.current?.focus()

    setSubmitting(true)
    const result = await send(currentPassword, label.trim())
    setSubmitting(false)
    if (result.ok) return
    if (result.fieldErrors.currentPassword || result.fieldErrors.label) {
      setErrors(result.fieldErrors)
      if (result.fieldErrors.currentPassword) {
        setCurrentPassword('')
        passwordRef.current?.focus()
      } else labelRef.current?.focus()
    } else {
      setFormError(result.code)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="mt-4 flex flex-col gap-5">
      <p className="text-stone-700">{intro}</p>
      {formError && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {t(`errors.${formError}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
      {withLabel && (
        <FormField
          id="label"
          label={t('passkeys.name')}
          hint={t('passkeys.nameHint')}
          maxLength={64}
          dir="auto"
          value={label}
          onChange={setLabel}
          error={errors.label}
          inputRef={labelRef}
        />
      )}
      <FormField
        id="currentPassword"
        label={t('changePassword.current')}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={setCurrentPassword}
        error={errors.currentPassword}
        inputRef={passwordRef}
      />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} aria-busy={submitting || undefined} className={primary}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={secondary}>
          {t('twoFactor.cancel')}
        </button>
      </div>
    </form>
  )
}
