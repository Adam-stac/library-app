import type { useTranslation } from 'react-i18next'
import { getJson } from './api'

export type ActiveSession = {
  handle: string
  device: string
  ip: string | null
  signedInAt: string
  lastActiveAt: string
  current: boolean
}

export type SecurityEvent = {
  type: string
  detail: string | null
  device: string
  ip: string | null
  occurredAt: string
}

/** Both lists for the security page, fetched together. */
export async function fetchActivity() {
  const [sessions, events] = await Promise.all([
    getJson<ActiveSession[]>('/api/v1/auth/sessions'),
    getJson<SecurityEvent[]>('/api/v1/auth/security-events'),
  ])
  return { sessions, events }
}

type T = ReturnType<typeof useTranslation>['t']

/** The API describes devices in English ("Firefox on Linux"); only the unknown case needs translating. */
export function deviceName(device: string, t: T) {
  return device === 'Unknown device' ? t('security.unknownDevice') : device
}

/** A friendly sentence for each event type, in the reader's language. Unknown types fall back to a generic line. */
export function eventText(event: SecurityEvent, t: T): string {
  const detail = event.detail ?? ''
  switch (event.type) {
    case 'sign_in':
      return t(`security.events.sign_in_${detail}`, { defaultValue: t('security.events.sign_in') })
    case 'sign_in_failed':
      return t(`security.events.sign_in_failed_${detail}`, { defaultValue: t('security.events.sign_in_failed') })
    case 'recovery_code_used':
      return t('security.events.recovery_code_used', { left: parseInt(detail, 10) || 0 })
    case 'other_sessions_ended':
      return t('security.events.other_sessions_ended', { count: parseInt(detail, 10) || 0 })
    case 'session_ended':
      return t('security.events.session_ended', { device: deviceName(detail, t) })
    case 'email_change_requested':
    case 'email_changed':
      return t(`security.events.${event.type}`, { email: detail })
    case 'passkey_added':
    case 'passkey_removed':
      return t(`security.events.${event.type}`, { label: detail })
    default:
      return t(`security.events.${event.type}`, { defaultValue: t('security.events.other') })
  }
}
