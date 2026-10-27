import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'

type Status = 'checking' | 'success' | 'invalid' | 'error'

/** Opened from the link sent to the new address. Reads the token from the #fragment and removes it, like email verification. */
export default function ConfirmEmailChangePage() {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'))
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'invalid')
  const started = useRef(false)

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)

    if (!token || started.current) return // never send the same token twice
    started.current = true
    void postJson('/api/v1/auth/confirm-email-change', { token }, { csrf: true }).then((result) => {
      if (result.ok) {
        setStatus('success')
        void refresh() // shows the new address, or signed out if this browser wasn't the one that asked
      } else setStatus(result.status === 400 ? 'invalid' : 'error')
    })
  }, [token, refresh])

  if (status === 'checking') {
    return (
      <p role="status" className="text-lg">
        {t('confirmEmail.checking')}
      </p>
    )
  }

  const content = {
    success: { title: t('confirmEmail.successTitle'), body: t('confirmEmail.successBody'), link: '/', linkText: t('verify.goHome') },
    invalid: {
      title: t('confirmEmail.invalidTitle'),
      body: t('confirmEmail.invalidBody'),
      link: '/account',
      linkText: t('confirmEmail.tryAgain'),
    },
    error: { title: t('verify.errorTitle'), body: t('errors.unexpected'), link: '/', linkText: t('verify.goHome') },
  }[status]

  return (
    <section role="status" className="max-w-md">
      <h1 className="page-title">{content.title}</h1>
      <p className="lede mt-3">{content.body}</p>
      <p className="mt-8">
        <Link to={content.link} className="link">
          {content.linkText}
        </Link>
      </p>
    </section>
  )
}
