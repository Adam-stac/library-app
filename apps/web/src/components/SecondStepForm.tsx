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
      <h1 className="page-title">{t('secondStep.title')}</h1>
      <p className="lede">{t('secondStep.intro')}</p>

      <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="label">
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
            className="field font-mono tracking-widest"
          />
          <p id="code-hint" className="text-sm text-muted">
            {t('secondStep.hint')}
          </p>
          {error && (
            <p id="code-error" role="alert" className="text-sm text-danger">
              {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="btn btn-primary"
        >
          {submitting ? t('secondStep.submitting') : t('secondStep.submit')}
        </button>
      </form>

      <p className="mt-8">
        <button
          type="button"
          onClick={() => onStartAgain(null)}
          className="min-h-11 link"
        >
          {t('secondStep.startAgain')}
        </button>
      </p>
    </section>
  )
}
