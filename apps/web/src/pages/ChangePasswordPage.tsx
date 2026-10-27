import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'
import NewPasswordField from '../components/NewPasswordField'
import { MIN_PASSWORD_LENGTH, passwordLength } from '../password'

export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const { state, refresh } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (done) doneHeadingRef.current?.focus()
  }, [done])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors)
    if (errors.currentPassword) currentRef.current?.focus()
    else if (errors.newPassword) newRef.current?.focus()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)

    const local: Record<string, string> = {}
    if (!currentPassword) local.currentPassword = 'required'
    if (!newPassword) local.newPassword = 'required'
    else if (passwordLength(newPassword) < MIN_PASSWORD_LENGTH) local.newPassword = 'too_short'
    if (Object.keys(local).length > 0) return showFieldErrors(local)

    setSubmitting(true)
    setFieldErrors({})
    const result = await postJson('/api/v1/auth/change-password', { currentPassword, newPassword }, { csrf: true })
    setSubmitting(false)

    if (result.ok) {
      setCurrentPassword('')
      setNewPassword('')
      setDone(true)
    } else if (result.status === 401) {
      void refresh() // the session has ended; this sends the person to sign in
    } else if (result.fieldErrors.currentPassword || result.fieldErrors.newPassword) {
      if (result.fieldErrors.currentPassword) setCurrentPassword('')
      showFieldErrors(result.fieldErrors)
    } else {
      setFormError(result.code)
    }
  }

  if (done) {
    return (
      <section role="status" className="max-w-md">
        <h1 ref={doneHeadingRef} tabIndex={-1} className="page-title focus:outline-none">
          {t('changePassword.doneTitle')}
        </h1>
        <p className="lede mt-3">{t('changePassword.doneBody')}</p>
        <p className="mt-8">
          <Link to="/" className="link">
            {t('verify.goHome')}
          </Link>
        </p>
      </section>
    )
  }

  const errorText = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.unexpected') })

  return (
    <section className="max-w-md">
      <h1 className="page-title">{t('changePassword.title')}</h1>
      <p className="lede">{t('changePassword.intro')}</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        {formError && (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-danger">
            {errorText(formError)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="currentPassword" className="label">
            {t('changePassword.current')}
          </label>
          <input
            ref={currentRef}
            id="currentPassword"
            name="currentPassword"
            type={showPasswords ? 'text' : 'password'}
            dir="ltr"
            autoComplete="current-password"
            maxLength={1024}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={fieldErrors.currentPassword ? true : undefined}
            aria-describedby={fieldErrors.currentPassword ? 'currentPassword-error' : undefined}
            className="field"
          />
          {fieldErrors.currentPassword && (
            <p id="currentPassword-error" className="text-sm text-danger">
              {errorText(fieldErrors.currentPassword)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <NewPasswordField
            id="newPassword"
            label={t('changePassword.new')}
            value={newPassword}
            onChange={setNewPassword}
            visible={showPasswords}
            error={fieldErrors.newPassword}
            inputRef={newRef}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="size-5"
            />
            {t('changePassword.showPasswords')}
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary"
        >
          {submitting ? t('changePassword.submitting') : t('changePassword.submit')}
        </button>
      </form>
    </section>
  )
}
