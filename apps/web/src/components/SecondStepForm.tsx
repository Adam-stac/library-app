import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/context'

/** The second step of signing in: a code from the authenticator app, or a recovery code. */
export default function SecondStepForm({ onStartAgain }: { onStartAgain: (reason: string | null) => void }) {
  const { t } = useTranslation()
  const { completeSecondStep } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    codeRef.current?.focus()
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!code.trim()) {
      setError('required')
      codeRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    const result = await completeSecondStep(code)
    setSubmitting(false)

    if (result.ok) {
      navigate('/', { replace: true })
    } else if (result.code === 'sign_in_again') {
      onStartAgain('sign_in_again')
    } else {
      setCode('')
      setError(result.code)
      codeRef.current?.focus()
    }
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-semibold">{t('secondStep.title')}</h1>
      <p className="mt-3 text-stone-700">{t('secondStep.intro')}</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="font-semibold">
            {t('secondStep.code')}
          </label>
          <input
            ref={codeRef}
            id="code"
            name="code"
            type="text"
            dir="ltr"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'code-hint code-error' : 'code-hint'}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 font-mono tracking-widest aria-invalid:border-red-700"
          />
          <p id="code-hint" className="text-sm text-stone-700">
            {t('secondStep.hint')}
          </p>
          {error && (
            <p id="code-error" role="alert" className="text-sm text-red-800">
              {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="min-h-11 rounded-full bg-stone-900 px-6 font-semibold text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {submitting ? t('secondStep.submitting') : t('secondStep.submit')}
        </button>
      </form>

      <p className="mt-8">
        <button
          type="button"
          onClick={() => onStartAgain(null)}
          className="min-h-11 font-semibold underline underline-offset-4"
        >
          {t('secondStep.startAgain')}
        </button>
      </p>
    </section>
  )
}
