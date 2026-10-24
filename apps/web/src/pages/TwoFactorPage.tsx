import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { type ApiResult, getJson, postJson } from '../api'
import { useAuth } from '../auth/context'
import FormField from '../components/FormField'
import QrCode from '../components/QrCode'

type Status = { enabled: boolean; recoveryCodesLeft: number }
type Setup = { secret: string; otpauthUri: string }
type View =
  | { name: 'status'; notice?: string }
  | { name: 'start' }
  | { name: 'scan'; setup: Setup }
  | { name: 'codes'; codes: string[] }
  | { name: 'newCodes' }
  | { name: 'turnOff' }

const button =
  'min-h-11 rounded-full px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'
const primary = `${button} bg-stone-900 text-white hover:bg-stone-700`
const secondary = `${button} border border-stone-900 hover:bg-stone-100`

/** Turning two-step verification on and off, and managing recovery codes. Signed-in accounts only. */
export default function TwoFactorPage() {
  const { t } = useTranslation()
  const { state, refresh } = useAuth()
  const [status, setStatus] = useState<Status | null>(null)
  const [view, setView] = useState<View>({ name: 'status' })
  const headingRef = useRef<HTMLHeadingElement>(null)

  const load = useCallback(async () => {
    const result = await getJson<Status>('/api/v1/auth/2fa')
    if (result.ok && result.data) setStatus(result.data)
    else if (result.status === 401) void refresh()
  }, [refresh])

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void getJson<Status>('/api/v1/auth/2fa').then((result) => {
      if (!current) return
      if (result.ok && result.data) setStatus(result.data)
      else if (result.status === 401) void refresh()
    })
    return () => {
      current = false
    }
  }, [state.status, refresh])

  useEffect(() => {
    headingRef.current?.focus()
  }, [view.name])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  /** Shared handling for every call: a 401 means the session has ended, so go and sign in again. */
  function signedOutIf<T>(result: ApiResult<T>): ApiResult<T> {
    if (!result.ok && result.status === 401) void refresh()
    return result
  }

  const backToStatus = async (notice?: string) => {
    await load()
    setView({ name: 'status', notice })
  }

  const heading = (text: string) => (
    <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none">
      {text}
    </h1>
  )

  if (view.name === 'start') {
    return (
      <section className="max-w-md">
        {heading(t('twoFactor.turnOnTitle'))}
        <p className="mt-3 text-stone-700">{t('twoFactor.passwordFirst')}</p>
        <PasswordForm
          submitLabel={t('twoFactor.continue')}
          onCancel={() => setView({ name: 'status' })}
          send={async (currentPassword) => {
            const result = signedOutIf(
              await postJson<Setup>('/api/v1/auth/2fa/totp/setup', { currentPassword }, { csrf: true }),
            )
            if (result.ok && result.data) setView({ name: 'scan', setup: result.data })
            return result
          }}
        />
      </section>
    )
  }

  if (view.name === 'scan') {
    return (
      <section className="max-w-xl">
        {heading(t('twoFactor.turnOnTitle'))}
        <ol className="mt-6 flex flex-col gap-8">
          <li>
            <h2 className="text-lg font-semibold">{t('twoFactor.step1')}</h2>
            <p className="mt-2 text-stone-700">{t('twoFactor.step1Body')}</p>
            <div className="mt-4">
              <QrCode text={view.setup.otpauthUri} label={t('twoFactor.qrLabel')} />
            </div>
            <p className="mt-4 text-sm text-stone-700">{t('twoFactor.manualKey')}</p>
            <p
              dir="ltr"
              data-testid="totp-secret"
              className="mt-1 font-mono text-lg tracking-wider break-all select-all"
            >
              {view.setup.secret.match(/.{1,4}/g)?.join(' ')}
            </p>
          </li>
          <li>
            <h2 className="text-lg font-semibold">{t('twoFactor.step2')}</h2>
            <CodeForm
              label={t('twoFactor.codeFromApp')}
              submitLabel={t('twoFactor.turnOn')}
              onCancel={() => setView({ name: 'status' })}
              send={async (code) => {
                const result = signedOutIf(
                  await postJson<{ recoveryCodes: string[] }>('/api/v1/auth/2fa/totp/confirm', { code }, { csrf: true }),
                )
                if (result.ok && result.data) setView({ name: 'codes', codes: result.data.recoveryCodes })
                return result
              }}
            />
          </li>
        </ol>
      </section>
    )
  }

  if (view.name === 'codes') {
    return (
      <section className="max-w-xl">
        {heading(t('twoFactor.codesTitle'))}
        <RecoveryCodes codes={view.codes} onDone={() => void backToStatus()} />
      </section>
    )
  }

  if (view.name === 'newCodes') {
    return (
      <section className="max-w-md">
        {heading(t('twoFactor.newCodesTitle'))}
        <p className="mt-3 text-stone-700">{t('twoFactor.newCodesBody')}</p>
        <PasswordForm
          submitLabel={t('twoFactor.createCodes')}
          onCancel={() => setView({ name: 'status' })}
          send={async (currentPassword) => {
            const result = signedOutIf(
              await postJson<{ recoveryCodes: string[] }>(
                '/api/v1/auth/2fa/recovery-codes',
                { currentPassword },
                { csrf: true },
              ),
            )
            if (result.ok && result.data) setView({ name: 'codes', codes: result.data.recoveryCodes })
            return result
          }}
        />
      </section>
    )
  }

  if (view.name === 'turnOff') {
    return (
      <section className="max-w-md">
        {heading(t('twoFactor.turnOffTitle'))}
        <p className="mt-3 text-stone-700">{t('twoFactor.turnOffBody')}</p>
        <PasswordForm
          withCode
          submitLabel={t('twoFactor.turnOff')}
          onCancel={() => setView({ name: 'status' })}
          send={async (currentPassword, code) => {
            const result = signedOutIf(
              await postJson('/api/v1/auth/2fa/totp/disable', { currentPassword, code }, { csrf: true }),
            )
            if (result.ok) await backToStatus(t('twoFactor.turnedOff'))
            return result
          }}
        />
      </section>
    )
  }

  return (
    <section className="max-w-xl">
      {heading(t('twoFactor.title'))}
      <p className="mt-3 text-stone-700">{t('twoFactor.intro')}</p>
      {view.notice && (
        <p role="status" className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">
          {view.notice}
        </p>
      )}
      {status && (
        <div className="mt-8 rounded-lg border border-stone-200 bg-white p-6">
          <p className="text-lg">
            {t('twoFactor.statusLabel')}{' '}
            <strong className="font-semibold">{status.enabled ? t('twoFactor.on') : t('twoFactor.off')}</strong>
          </p>
          {status.enabled ? (
            <>
              <p className="mt-2 text-stone-700">
                {t('twoFactor.codesLeft', { count: status.recoveryCodesLeft })}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className={secondary} onClick={() => setView({ name: 'newCodes' })}>
                  {t('twoFactor.createCodes')}
                </button>
                <button type="button" className={secondary} onClick={() => setView({ name: 'turnOff' })}>
                  {t('twoFactor.turnOff')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-stone-700">{t('twoFactor.offBody')}</p>
              <div className="mt-6">
                <button type="button" className={primary} onClick={() => setView({ name: 'start' })}>
                  {t('twoFactor.turnOn')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

type SendResult = ApiResult<unknown>

function FormActions({ submitting, submitLabel, onCancel }: { submitting: boolean; submitLabel: string; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={submitting} aria-busy={submitting || undefined} className={primary}>
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} className={secondary}>
        {t('twoFactor.cancel')}
      </button>
    </div>
  )
}

function FormError({ code }: { code: string | null }): ReactNode {
  const { t } = useTranslation()
  if (!code) return null
  return (
    <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
      {t(`errors.${code}`, { defaultValue: t('errors.unexpected') })}
    </p>
  )
}

/** Asks for the password again (and a code, when turning it off). */
function PasswordForm({
  withCode = false,
  submitLabel,
  onCancel,
  send,
}: {
  withCode?: boolean
  submitLabel: string
  onCancel: () => void
  send: (currentPassword: string, code: string) => Promise<SendResult>
}) {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    const local: Record<string, string> = {}
    if (!currentPassword) local.currentPassword = 'required'
    if (withCode && !code.trim()) local.code = 'required'
    setErrors(local)
    if (local.currentPassword) return passwordRef.current?.focus()
    if (local.code) return codeRef.current?.focus()

    setSubmitting(true)
    const result = await send(currentPassword, code)
    setSubmitting(false)
    if (result.ok) return
    if (result.fieldErrors.currentPassword || result.fieldErrors.code) {
      setErrors(result.fieldErrors)
      if (result.fieldErrors.currentPassword) {
        setCurrentPassword('')
        passwordRef.current?.focus()
      } else {
        setCode('')
        codeRef.current?.focus()
      }
    } else {
      setFormError(result.code)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <FormError code={formError} />
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
      {withCode && (
        <FormField
          id="code"
          label={t('secondStep.code')}
          hint={t('secondStep.hint')}
          autoComplete="one-time-code"
          maxLength={64}
          mono
          value={code}
          onChange={setCode}
          error={errors.code}
          inputRef={codeRef}
        />
      )}
      <FormActions submitting={submitting} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  )
}

/** Asks for the 6-digit code from the app, to prove it was set up correctly. */
function CodeForm({
  label,
  submitLabel,
  onCancel,
  send,
}: {
  label: string
  submitLabel: string
  onCancel: () => void
  send: (code: string) => Promise<SendResult>
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError(null)
    if (!code.trim()) {
      setError('required')
      return codeRef.current?.focus()
    }
    setSubmitting(true)
    const result = await send(code)
    setSubmitting(false)
    if (result.ok) return
    if (result.fieldErrors.code) {
      setError(result.fieldErrors.code)
      setCode('')
      codeRef.current?.focus()
    } else {
      setFormError(result.code)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="mt-4 flex max-w-md flex-col gap-6">
      <FormError code={formError} />
      <FormField
        id="code"
        label={label}
        autoComplete="one-time-code"
        maxLength={64}
        mono
        value={code}
        onChange={setCode}
        error={error}
        inputRef={codeRef}
      />
      <FormActions submitting={submitting} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  )
}

/** Shows new recovery codes once, with ways to keep them. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${t('app.name')}\n\n${text}\n`], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'my-library-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <p className="mt-3 text-stone-700">{t('twoFactor.codesBody')}</p>
      <ul
        dir="ltr"
        aria-label={t('twoFactor.codesTitle')}
        className="mt-6 grid grid-cols-1 gap-2 rounded-lg border border-stone-300 bg-white p-6 font-mono text-lg sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={() => void copy()}>
          {t('twoFactor.copy')}
        </button>
        <button type="button" className={secondary} onClick={download}>
          {t('twoFactor.download')}
        </button>
        <button type="button" className={primary} onClick={onDone}>
          {t('twoFactor.saved')}
        </button>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-stone-700">
        {copied ? t('twoFactor.copied') : ''}
      </p>
    </>
  )
}
