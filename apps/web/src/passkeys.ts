import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { type ApiResult, postJson } from './api'

export type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null }

export function passkeysSupported(): boolean {
  try {
    return browserSupportsWebAuthn()
  } catch {
    return false
  }
}

/** Turns a browser passkey error into one of our error codes, so the page can explain it. */
function browserError(error: unknown): ApiResult<never> {
  const name = error instanceof Error ? error.name : ''
  const code = (error as { code?: string } | null)?.code
  let reason = 'passkey_failed'
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') reason = 'passkey_cancelled'
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') reason = 'passkey_already_registered'
  return { ok: false, status: 0, code: reason, fieldErrors: {}, details: {} }
}

/** Asks the browser to sign in with any of this site's passkeys, then lets the API check the answer. */
export async function signInWithPasskey<T>(): Promise<ApiResult<T>> {
  const options = await postJson<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
    '/api/v1/auth/passkeys/login/options',
    undefined,
    { csrf: true },
  )
  if (!options.ok || !options.data) return options as ApiResult<never>
  let credential
  try {
    credential = await startAuthentication({ optionsJSON: options.data })
  } catch (error) {
    return browserError(error)
  }
  return postJson<T>('/api/v1/auth/passkeys/login', { credential }, { csrf: true })
}

/** Checks the password, asks the browser to create a passkey, then lets the API check and store it. */
export async function addPasskey(currentPassword: string, label: string): Promise<ApiResult<Passkey>> {
  const options = await postJson<Parameters<typeof startRegistration>[0]['optionsJSON']>(
    '/api/v1/auth/passkeys/register/options',
    { currentPassword },
    { csrf: true },
  )
  if (!options.ok || !options.data) return options as ApiResult<never>
  let credential
  try {
    credential = await startRegistration({ optionsJSON: options.data })
  } catch (error) {
    return browserError(error)
  }
  return postJson<Passkey>('/api/v1/auth/passkeys/register', { label, credential }, { csrf: true })
}
