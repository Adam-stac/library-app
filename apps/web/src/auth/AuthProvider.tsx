import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { getJson, postJson } from '../api'
import { type Account, type Auth, AuthContext, type AuthState } from './context'

/**
 * Knows whether we're signed in. The session itself lives on the server, in a cookie JavaScript can't
 * read, so the only way to find out is to ask the API (/me).
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void getJson<Account>('/api/v1/auth/me').then((result) => {
      if (!current) return
      setState(result.ok && result.data ? { status: 'signedIn', account: result.data } : { status: 'signedOut' })
    })
    return () => {
      current = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await postJson<Account>('/api/v1/auth/login', { email, password }, { csrf: true })
    if (result.ok && result.data) setState({ status: 'signedIn', account: result.data })
    return result
  }, [])

  const signOut = useCallback(async () => {
    const result = await postJson('/api/v1/auth/logout', undefined, { csrf: true })
    if (!result.ok && result.status !== 401) return false
    setState({ status: 'signedOut' })
    return true
  }, [])

  const auth = useMemo<Auth>(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext value={auth}>{children}</AuthContext>
}
