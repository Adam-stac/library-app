import { type FormEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import SecondStepForm from '../components/SecondStepForm'

export default function SignInPage() {
  const { t } = useTranslation()
  const { state, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [secondStep, setSecondStep] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  if (state.status === 'signedIn' && !submitting) return <Navigate to="/" replace />

  const errorText = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.unexpected') })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)

    const local: Record<string, string> = {}
    if (!email.trim()) local.email = 'required'
    if (!password) local.password = 'required'
    setFieldErrors(local)
    if (local.email) return emailRef.current?.focus()
    if (local.password) return passwordRef.current?.focus()

    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)

    if (result.ok && result.data?.secondStepRequired) {
      setPassword('')
      setSecondStep(true)
      return
    }
    if (result.ok) {
      navigate('/', { replace: true })
      return
    }
    // Never say which part was wrong: that would reveal who has an account
    setPassword('')
    setFormError(result.code)
    passwordRef.current?.focus()
  }

  const describedBy = (id: string) => (fieldErrors[id] ? `${id}-error` : undefined)

  if (secondStep) {
    return (
      <SecondStepForm
        onStartAgain={(reason) => {
          setSecondStep(false)
          setFormError(reason)
        }}
      />
    )
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-semibold">{t('signIn.title')}</h1>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        {formError && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            <p>{errorText(formError)}</p>
            {formError === 'invalid_credentials' && <p className="mt-2 text-sm">{t('signIn.lockoutHint')}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
            {t('signIn.email')}
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
            {t('signIn.password')}
          </label>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            dir="ltr"
            autoComplete="current-password"
            maxLength={1024}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('password')}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700"
          />
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
            {t('signIn.showPassword')}
          </label>
          <Link to="/forgot-password" className="self-start text-sm font-semibold underline underline-offset-4">
            {t('signIn.forgotPassword')}
          </Link>
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="min-h-11 rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {submitting ? t('signIn.submitting') : t('signIn.submit')}
        </button>
      </form>

      <p className="mt-8 text-stone-700">
        {t('signIn.noAccount')}{' '}
        <Link to="/register" className="font-semibold text-stone-900 underline underline-offset-4">
          {t('signIn.createAccount')}
        </Link>
      </p>
    </section>
  )
}
