import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { postJson } from '../api'
import { useAuth } from '../auth/context'
import { type ActiveSession, deviceName, eventText, fetchActivity, type SecurityEvent } from '../security'

const button =
  'min-h-11 rounded-full px-6 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60'
const secondary = `${button} border border-stone-900 hover:bg-stone-100`

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
      <h1 className="text-3xl font-semibold">{t('security.title')}</h1>
      <p className="mt-3 text-stone-700">{t('security.intro')}</p>

      {notice && (
        <p role="status" className="mt-6 rounded-lg border border-stone-300 bg-white px-4 py-3">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {error === 'not_found'
            ? t('security.sessionGone')
            : t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}

      <h2 id="sessions-title" className="mt-8 text-xl font-semibold">
        {t('security.sessionsTitle')}
      </h2>
      {sessions && (
        <>
          <ul aria-labelledby="sessions-title" className="mt-3 flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.handle} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <bdi>{deviceName(session.device, t)}</bdi>
                      {session.current && (
                        <span className="ms-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs font-semibold text-white">
                          {t('security.thisDevice')}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-stone-700">
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
            <p className="mt-3 text-stone-700">{t('security.onlyThisDevice')}</p>
          )}
        </>
      )}

      <h2 id="activity-title" className="mt-10 text-xl font-semibold">
        {t('security.activityTitle')}
      </h2>
      <p className="mt-2 text-stone-700">{t('security.activityIntro')}</p>
      {events && events.length > 0 && (
        <ol aria-labelledby="activity-title" className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {events.map((event, index) => (
            <li key={`${event.occurredAt}-${index}`} className="px-4 py-3">
              <p className="font-semibold">
                {WARNINGS.has(event.type) && (
                  <span aria-hidden="true" className="me-2 text-red-700">
                    !
                  </span>
                )}
                {eventText(event, t)}
              </p>
              <p className="text-sm text-stone-700">
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
      {events && events.length === 0 && <p className="mt-3 text-stone-700">{t('security.noActivity')}</p>}

      <p className="mt-8 rounded-lg border-s-4 border-stone-400 bg-white px-4 py-3 text-stone-700">
        {t('security.notYou')}{' '}
        <Link to="/change-password" className="font-semibold underline underline-offset-4">
          {t('home.changePassword')}
        </Link>
      </p>
    </section>
  )
}
