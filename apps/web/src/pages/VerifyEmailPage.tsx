import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'

type Status = 'checking' | 'success' | 'invalid' | 'error'

/** Reads the one-time token from the link's #fragment, removes it from the address bar, and confirms it. */
export default function VerifyEmailPage() {
  const { t } = useTranslation()
  // Read the token once, when the page opens
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'))
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'invalid')
  const started = useRef(false)

  useEffect(() => {
    // Take the token out of the address bar and browser history straight away
    window.history.replaceState(window.history.state, '', window.location.pathname)

    if (!token || started.current) return // never send the same token twice (React may run effects twice in development)
    started.current = true
    void postJson('/api/v1/auth/verify-email', { token }).then((result) => {
      if (result.ok) setStatus('success')
      else setStatus(result.status === 400 ? 'invalid' : 'error')
    })
  }, [token])

  if (status === 'checking') {
    return (
      <p role="status" className="text-lg">
        {t('verify.checking')}
      </p>
    )
  }

  const content = {
    success: { title: t('verify.successTitle'), body: t('verify.successBody'), link: '/', linkText: t('verify.goHome') },
    invalid: {
      title: t('verify.invalidTitle'),
      body: t('verify.invalidBody'),
      link: '/register',
      linkText: t('verify.registerAgain'),
    },
    error: { title: t('verify.errorTitle'), body: t('errors.unexpected'), link: '/', linkText: t('verify.goHome') },
  }[status]

  return (
    <section role="status" className="max-w-md">
      <h1 className="text-3xl font-semibold">{content.title}</h1>
      <p className="mt-4 text-lg text-stone-700">{content.body}</p>
      <p className="mt-8">
        <Link to={content.link} className="font-semibold underline underline-offset-4">
          {content.linkText}
        </Link>
      </p>
    </section>
  )
}
