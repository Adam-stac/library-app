import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (sentTo) doneHeadingRef.current?.focus()
  }, [sentTo])

  const errorText = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.unexpected') })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    if (!email.trim()) {
      setFieldError('required')
      emailRef.current?.focus()
      return
    }

    setSubmitting(true)
    setFieldError(null)
    const result = await postJson('/api/v1/auth/password-reset/request', { email }, { csrf: true })
    setSubmitting(false)

    if (result.ok) {
      setSentTo(email.trim())
    } else if (result.fieldErrors.email) {
      setFieldError(result.fieldErrors.email)
      emailRef.current?.focus()
    } else {
      setFormError(result.code)
    }
  }

  if (sentTo) {
    return (
      <section className="max-w-md">
        <h1 ref={doneHeadingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none">
          {t('forgot.checkInboxTitle')}
        </h1>
        <p className="mt-4 text-lg text-stone-700">{t('forgot.checkInboxBody', { email: sentTo })}</p>
        <p className="mt-8">
          <Link to="/sign-in" className="font-semibold underline underline-offset-4">
            {t('forgot.backToSignIn')}
          </Link>
        </p>
      </section>
    )
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-semibold">{t('forgot.title')}</h1>
      <p className="mt-3 text-stone-700">{t('forgot.intro')}</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        {formError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            {errorText(formError)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
            {t('forgot.email')}
          </label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'email-error' : undefined}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700"
          />
          {fieldError && (
            <p id="email-error" className="text-sm text-red-800">
              {errorText(fieldError)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="min-h-11 rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {submitting ? t('forgot.submitting') : t('forgot.submit')}
        </button>
      </form>

      <p className="mt-8">
        <Link to="/sign-in" className="font-semibold underline underline-offset-4">
          {t('forgot.backToSignIn')}
        </Link>
      </p>
    </section>
  )
}
