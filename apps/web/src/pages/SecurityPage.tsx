import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'
import { BackToSettings } from '../components/BackLink'
import { type ActiveSession, deviceName, eventText, fetchActivity, type SecurityEvent } from '../security'

const secondary = 'btn'

/** Event types that mean something may be wrong: shown with a marker so they stand out. */
const WARNINGS = new Set(['sign_in_failed', 'account_locked', 'second_step_failed'])

/** Where you're signed in, and what has happened to your account. Signed-in accounts only. */
export default function SecurityPage() {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null)
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state.status !== 'signedIn') return
    let current = true
    void fetchActivity().then((result) => {
      if (!current) return
      if (result.sessions.status === 401 || result.events.status === 401) return void refresh()
      if (result.sessions.ok && result.sessions.data) setSessions(result.sessions.data)
      if (result.events.ok && result.events.data) setEvents(result.events.data)
    })
    return () => {
      current = false
    }
  }, [state.status, refresh])

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  async function reload() {
    const result = await fetchActivity()
    if (result.sessions.ok && result.sessions.data) setSessions(result.sessions.data)
    if (result.events.ok && result.events.data) setEvents(result.events.data)
  }

  async function end(path: string, key: string, message: string) {
    setBusy(key)
    setNotice(null)
    setError(null)
    const result = await postJson(path, {}, { csrf: true })
    setBusy(null)
    if (result.ok) {
      setNotice(message)
      await reload()
    } else if (result.status === 401) {
      void refresh()
    } else {
      setError(result.code)
      await reload()
    }
  }

  const others = sessions?.filter((session) => !session.current) ?? []

  return (
    <section className="max-w-2xl">
      <BackToSettings />
      <h1 className="page-title">{t('security.title')}</h1>
      <p className="lede">{t('security.intro')}</p>

      {notice && (
        <p role="status" className="notice mt-6">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-danger">
          {error === 'not_found'
            ? t('security.sessionGone')
            : t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}

      <h2 id="sessions-title" className="section-title mt-12">
        {t('security.sessionsTitle')}
      </h2>
      {sessions && (
        <>
          <ul aria-labelledby="sessions-title" className="mt-3 flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.handle} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <bdi>{deviceName(session.device, t)}</bdi>
                      {session.current && (
                        <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                          {t('security.thisDevice')}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {t('security.signedIn', { when: when(session.signedInAt) })}
                      {' · '}
                      {t('security.lastActive', { when: when(session.lastActiveAt) })}
                      {session.ip && (
                        <>
                          {' · '}
                          <bdi dir="ltr">{session.ip}</bdi>
                        </>
                      )}
                    </p>
                  </div>
                  {!session.current && (
                    <button
                      type="button"
                      className={secondary}
                      disabled={busy !== null}
                      aria-busy={busy === session.handle || undefined}
                      aria-label={t('security.signOutNamed', { device: deviceName(session.device, t) })}
                      onClick={() =>
                        void end(
                          `/api/v1/auth/sessions/${encodeURIComponent(session.handle)}/end`,
                          session.handle,
                          t('security.signedOutOne', { device: deviceName(session.device, t) }),
                        )
                      }
                    >
                      {t('security.signOut')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {others.length > 0 ? (
            <p className="mt-4">
              <button
                type="button"
                className={secondary}
                disabled={busy !== null}
                aria-busy={busy === 'others' || undefined}
                onClick={() =>
                  void end('/api/v1/auth/sessions/end-others', 'others', t('security.signedOutOthers'))
                }
              >
                {t('security.signOutOthers')}
              </button>
            </p>
          ) : (
            <p className="mt-3 text-muted">{t('security.onlyThisDevice')}</p>
          )}
        </>
      )}

      <h2 id="activity-title" className="section-title mt-12">
        {t('security.activityTitle')}
      </h2>
      <p className="mt-2 text-muted">{t('security.activityIntro')}</p>
      {events && events.length > 0 && (
        <ol aria-labelledby="activity-title" className="card mt-3 divide-y divide-line">
          {events.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`} className="px-4 py-3">
              <p className="font-semibold">
                {WARNINGS.has(event.type) && (
                  <span aria-hidden="true" className="me-2 text-danger">
                    !
                  </span>
                )}
                {eventText(event, t)}
              </p>
              <p className="text-sm text-muted">
                <time dateTime={event.occurredAt}>{when(event.occurredAt)}</time>
                {' · '}
                <bdi>{deviceName(event.device, t)}</bdi>
                {event.ip && (
                  <>
                    {' · '}
                    <bdi dir="ltr">{event.ip}</bdi>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
      {events && events.length === 0 && <p className="mt-3 text-muted">{t('security.noActivity')}</p>}

      <p className="mt-8 rounded-lg border-s-4 border-line-strong bg-surface px-4 py-3 text-muted">
        {t('security.notYou')}{' '}
        <Link to="/change-password" className="link">
          {t('changePassword.title')}
        </Link>
      </p>
    </section>
  )
}
