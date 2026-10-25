import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { type ApiResult, getJson, postJson } from '../api'
import { useAuth } from '../auth/context'
import FormField from '../components/FormField'
import { type Language, saveLanguage } from '../language'

const primary = 'btn btn-primary'
const danger = 'btn btn-danger'
const card = 'mt-4 rounded-lg border border-line bg-surface p-6'

/** Account settings: language, email address, and deleting the account. Signed-in accounts only. */
export default function AccountPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const navigate = useNavigate()
  const [twoStepOn, setTwoStepOn] = useState<boolean | null>(null)
  const [languageNotice, setLanguageNotice] = useState<string | null>(null)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void getJson<{ enabled: boolean }>('/api/v1/auth/2fa').then((result) => {
      if (!current) return
      if (result.ok && result.data) setTwoStepOn(result.data.enabled)
      else if (result.status === 401) void refresh()
    })
    return () => {
      current = false
    }
  }, [state.status, refresh])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  async function chooseLanguage(language: Language) {
    setLanguageNotice(null)
    const saved = await saveLanguage(language, true)
    setLanguageNotice(saved ? i18n.t('account.languageSaved') : i18n.t('errors.unexpected'))
  }

  return (
    <section className="max-w-xl">
      <h1 className="page-title">{t('account.title')}</h1>

      <h2 className="section-title mt-12">{t('account.languageTitle')}</h2>
      <div className={card}>
        <fieldset>
          <legend className="text-muted">{t('account.languageBody')}</legend>
          <div className="mt-3 flex flex-wrap gap-4">
            {(['ar', 'en'] as const).map((language) => (
              <label key={language} lang={language} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="language"
                  value={language}
                  checked={i18n.language === language}
                  onChange={() => void chooseLanguage(language)}
                  className="size-5"
                />
                {language === 'ar' ? 'العربية' : 'English'}
              </label>
            ))}
          </div>
        </fieldset>
        {languageNotice && (
          <p role="status" className="mt-3 text-sm">
            {languageNotice}
          </p>
        )}
      </div>

      <h2 className="section-title mt-12">{t('account.emailTitle')}</h2>
      <div className={card}>
        <p>
          {t('account.emailNow')}{' '}
          <bdi dir="ltr" className="font-semibold">
            {state.account.email}
          </bdi>
        </p>
        {emailSentTo ? (
          <p role="status" className="mt-4 rounded-lg border border-line bg-paper px-4 py-3">
            {t('account.emailSent', { email: emailSentTo })}
          </p>
        ) : (
          twoStepOn !== null && (
            <ConfirmForm
              intro={t('account.emailIntro')}
              withNewEmail
              withCode={twoStepOn}
              submitLabel={t('account.emailSubmit')}
              submitClass={primary}
              send={async ({ currentPassword, code, newEmail }) => {
                const result = await postJson(
                  '/api/v1/auth/change-email',
                  { newEmail, currentPassword, code: code || undefined },
                  { csrf: true },
                )
                if (result.ok) setEmailSentTo(newEmail)
                else if (result.status === 401) void refresh()
                return result
              }}
            />
          )
        )}
      </div>

      <h2 className="section-title mt-12 text-danger">{t('account.deleteTitle')}</h2>
      <div className="mt-4 rounded-lg border border-danger-line bg-surface p-6">
        {twoStepOn !== null && (
          <ConfirmForm
            intro={t('account.deleteIntro')}
            withCode={twoStepOn}
            withUnderstood
            submitLabel={t('account.deleteSubmit')}
            submitClass={danger}
            send={async ({ currentPassword, code }) => {
              const result = await postJson(
                '/api/v1/auth/delete-account',
                { currentPassword, code: code || undefined },
                { csrf: true },
              )
              // The deleted page then asks the API again, which shows everyone signed out
              if (result.ok) navigate('/account-deleted', { replace: true })
              else if (result.status === 401) void refresh()
              return result
            }}
          />
        )}
      </div>
    </section>
  )
}

type Values = { currentPassword: string; code: string; newEmail: string }

/** Asks for the password (and a code, with two-step verification on) before a sensitive change. */
function ConfirmForm({
  intro,
  withNewEmail = false,
  withCode,
  withUnderstood = false,
  submitLabel,
  submitClass,
  send,
}: {
  intro: string
  withNewEmail?: boolean
  withCode: boolean
  withUnderstood?: boolean
  submitLabel: string
  submitClass: string
  send: (values: Values) => Promise<ApiResult<unknown>>
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Values>({ currentPassword: '', code: '', newEmail: '' })
  const [understood, setUnderstood] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const newEmailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const understoodRef = useRef<HTMLInputElement>(null)
  const set = (field: keyof Values) => (value: string) => setValues((previous) => ({ ...previous, [field]: value }))
  const idPrefix = withNewEmail ? 'email' : 'delete'

  function show(found: Record<string, string>) {
    setErrors(found)
    if (found.newEmail) newEmailRef.current?.focus()
    else if (found.currentPassword) passwordRef.current?.focus()
    else if (found.code) codeRef.current?.focus()
    else if (found.understood) understoodRef.current?.focus()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    const local: Record<string, string> = {}
    if (withNewEmail && !values.newEmail.trim()) local.newEmail = 'required'
    else if (withNewEmail && !/^[^\s@]+@[^\s@]+$/.test(values.newEmail.trim())) local.newEmail = 'invalid_email'
    if (!values.currentPassword) local.currentPassword = 'required'
    if (withCode && !values.code.trim()) local.code = 'required'
    if (withUnderstood && !understood) local.understood = 'confirm_delete'
    if (Object.keys(local).length > 0) return show(local)

    setSubmitting(true)
    setErrors({})
    const result = await send({ ...values, newEmail: values.newEmail.trim(), code: values.code.trim() })
    setSubmitting(false)
    if (result.ok) return
    if (Object.keys(result.fieldErrors).length > 0) {
      setValues((previous) => ({ ...previous, currentPassword: '', code: '' }))
      show(result.fieldErrors)
    } else {
      setFormError(result.code)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="mt-4 flex flex-col gap-5">
      <p className="text-muted">{intro}</p>
      {formError && (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-danger">
          {t(`errors.${formError}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
      {withNewEmail && (
        <FormField
          id="newEmail"
          label={t('account.newEmail')}
          autoComplete="email"
          maxLength={254}
          value={values.newEmail}
          onChange={set('newEmail')}
          error={errors.newEmail}
          inputRef={newEmailRef}
        />
      )}
      <FormField
        id={`${idPrefix}-currentPassword`}
        label={t('changePassword.current')}
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={set('currentPassword')}
        error={errors.currentPassword}
        inputRef={passwordRef}
      />
      {withCode && (
        <FormField
          id={`${idPrefix}-code`}
          label={t('account.code')}
          hint={t('account.codeHint')}
          autoComplete="one-time-code"
          maxLength={64}
          value={values.code}
          onChange={set('code')}
          error={errors.code}
          inputRef={codeRef}
        />
      )}
      {withUnderstood && (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-center gap-2">
            <input
              ref={understoodRef}
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              aria-invalid={errors.understood ? true : undefined}
              aria-describedby={errors.understood ? 'understood-error' : undefined}
              className="size-5"
            />
            {t('account.deleteUnderstood')}
          </label>
          {errors.understood && (
            <p id="understood-error" className="text-sm text-danger">
              {t('errors.confirm_delete')}
            </p>
          )}
        </div>
      )}
      <div>
        <button type="submit" disabled={submitting} aria-busy={submitting || undefined} className={submitClass}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
