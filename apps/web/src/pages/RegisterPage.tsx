import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'
import { MIN_PASSWORD_LENGTH, passwordLength } from '../password'

export default function RegisterPage() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (sentTo) doneHeadingRef.current?.focus()
  }, [sentTo])

  const errorText = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.unexpected') })

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors)
    if (errors.email) emailRef.current?.focus()
    else if (errors.password) passwordRef.current?.focus()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)

    // Quick checks in the browser first; the API checks everything again
    const local: Record<string, string> = {}
    if (!email.trim()) local.email = 'required'
    if (!password) local.password = 'required'
    else if (passwordLength(password) < MIN_PASSWORD_LENGTH) local.password = 'too_short'
    if (Object.keys(local).length > 0) {
      showFieldErrors(local)
      return
    }

    setSubmitting(true)
    setFieldErrors({})
    const result = await postJson('/api/v1/auth/register', {
      email,
      password,
      language: i18n.language === 'en' ? 'en' : 'ar',
    })
    setSubmitting(false)

    if (result.ok) {
      setPassword('')
      setSentTo(email.trim())
      return
    }
    const { email: emailError, password: passwordError } = result.fieldErrors
    if (emailError || passwordError) {
      showFieldErrors({ ...(emailError && { email: emailError }), ...(passwordError && { password: passwordError }) })
    } else {
      setFormError(result.code)
    }
  }

  if (sentTo) {
    return (
      <section className="max-w-md">
        <h1 ref={doneHeadingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none">
          {t('register.checkInboxTitle')}
        </h1>
        <p className="mt-4 text-lg text-stone-700">
          {t('register.checkInboxBody', { email: sentTo })}
        </p>
      </section>
    )
  }

  const describedBy = (id: string, hint?: string) =>
    [hint, fieldErrors[id] ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-semibold">{t('register.title')}</h1>
      <p className="mt-3 text-stone-700">{t('register.intro')}</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        {formError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            {errorText(formError)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
            {t('register.email')}
          </label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={describedBy('email')}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700"
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-sm text-red-800">
              {errorText(fieldErrors.email)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="font-semibold">
            {t('register.password')}
          </label>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            maxLength={512}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('password', 'password-hint')}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700"
          />
          <p id="password-hint" className="text-sm text-stone-700">
            {t('register.passwordHint')}{' '}
            <span aria-live="polite">{t('register.passwordCount', { count: passwordLength(password) })}</span>
          </p>
          {fieldErrors.password && (
            <p id="password-error" className="text-sm text-red-800">
              {errorText(fieldErrors.password)}
            </p>
          )}
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
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>
      </form>

      <p className="mt-8 text-stone-700">
        {t('register.haveAccount')}{' '}
        <Link to="/sign-in" className="font-semibold text-stone-900 underline underline-offset-4">
          {t('register.signIn')}
        </Link>
      </p>
    </section>
  )
}
