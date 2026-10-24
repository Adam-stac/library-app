import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ApiResult, getJson, postJson } from '../api'
import { signInWithPasskey as passkeySignIn } from '../passkeys'
import { type Account, type Auth, AuthContext, type AuthState, type SignInResult } from './context'

/**
 * Knows whether we're signed in. The session itself lives on the server, in a cookie JavaScript can't
 * read, so the only way to find out is to ask the API (/me).
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  // Every change of state gets a number; an answer to an older question is ignored. Otherwise a slow /me sent
  // when the page opened could land after a newer one (e.g. after changing the email) and show stale details.
  const latest = useRef(0)

  const ask = useCallback(async (): Promise<AuthState> => {
    const result = await getJson<Account>('/api/v1/auth/me')
    return result.ok && result.data ? { status: 'signedIn', account: result.data } : { status: 'signedOut' }
  }, [])

  useEffect(() => {
    const question = ++latest.current
    let active = true
    void ask().then((answer) => {
      if (active && question === latest.current) setState(answer)
    })
    return () => {
      active = false
    }
  }, [ask])

  const refresh = useCallback(async () => {
    const question = ++latest.current
    const answer = await ask()
    if (question === latest.current) setState(answer)
  }, [ask])

  /** Signed in only when the API says so; after the password alone it may still need the second step. */
  const finish = useCallback((result: ApiResult<SignInResult>) => {
    if (result.ok && result.data?.email && !result.data.secondStepRequired) {
      latest.current++ // the sign-in answer is newer than any /me still on its way
      setState({ status: 'signedIn', account: { email: result.data.email, language: result.data.language ?? 'ar' } })
    }
    return result
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) =>
      finish(await postJson<SignInResult>('/api/v1/auth/login', { email, password }, { csrf: true })),
    [finish],
  )

  const completeSecondStep = useCallback(
    async (code: string) => finish(await postJson<SignInResult>('/api/v1/auth/login/2fa', { code }, { csrf: true })),
    [finish],
  )

  const signOut = useCallback(async () => {
    const result = await postJson('/api/v1/auth/logout', undefined, { csrf: true })
    if (!result.ok && result.status !== 401) return false
    latest.current++
    setState({ status: 'signedOut' })
    return true
  }, [])

  const signInWithPasskey = useCallback(async () => finish(await passkeySignIn<SignInResult>()), [finish])

  const auth = useMemo<Auth>(
    () => ({ state, signIn, completeSecondStep, signInWithPasskey, signOut, refresh }),
    [state, signIn, completeSecondStep, signInWithPasskey, signOut, refresh],
  )
  return <AuthContext value={auth}>{children}</AuthContext>
}
