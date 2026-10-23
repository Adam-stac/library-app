import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'
import NewPasswordField from '../components/NewPasswordField'
import { MIN_PASSWORD_LENGTH, passwordLength } from '../password'

type Status = 'form' | 'done' | 'invalid'

/** Opened from the emailed link. The one-time token is in the #fragment, which never reaches any server log. */
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  // Read the token once, when the page opens
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'))
  const [status, setStatus] = useState<Status>(token ? 'form' : 'invalid')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Take the token out of the address bar and browser history straight away
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (status !== 'form') headingRef.current?.focus()
  }, [status])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !token) return
    setFormError(null)
    if (!password) return showFieldError('required')
    if (passwordLength(password) < MIN_PASSWORD_LENGTH) return showFieldError('too_short')

    setSubmitting(true)
    setFieldError(undefined)
    const result = await postJson('/api/v1/auth/password-reset/confirm', { token, password }, { csrf: true })
    setSubmitting(false)

    if (result.ok) {
      setPassword('')
      setStatus('done')
      void refresh() // every session was ended, including any in this browser
    } else if (result.code === 'invalid_token') {
      setStatus('invalid')
    } else if (result.fieldErrors.password) {
      showFieldError(result.fieldErrors.password)
    } else {
      setFormError(result.code)
    }
  }

  function showFieldError(code: string) {
    setFieldError(code)
    passwordRef.current?.focus()
  }

  if (status !== 'form') {
    const done = status === 'done'
    return (
      <section role="status" className="max-w-md">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none">
          {done ? t('reset.doneTitle') : t('reset.invalidTitle')}
        </h1>
        <p className="mt-4 text-lg text-stone-700">{done ? t('reset.doneBody') : t('reset.invalidBody')}</p>
        <p className="mt-8">
          <Link
            to={done ? '/sign-in' : '/forgot-password'}
            className="font-semibold underline underline-offset-4"
          >
            {done ? t('reset.signIn') : t('reset.requestNew')}
          </Link>
        </p>
      </section>
    )
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-semibold">{t('reset.title')}</h1>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        {formError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            {t(`errors.${formError}`, { defaultValue: t('errors.unexpected') })}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <NewPasswordField
            id="password"
            label={t('reset.newPassword')}
            value={password}
            onChange={setPassword}
            visible={showPassword}
            error={fieldError}
            inputRef={passwordRef}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="size-5"
            />
            {t('register.showPassword')}
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="min-h-11 rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {submitting ? t('reset.submitting') : t('reset.submit')}
        </button>
      </form>
    </section>
  )
}
