import { createContext, useContext } from 'react'
import type { ApiResult } from '../api'

export type Account = { email: string; language: string }

export type AuthState =
  | { status: 'loading' } // still asking the API whether we're signed in
  | { status: 'signedOut' }
  | { status: 'signedIn'; account: Account }

export type Auth = {
  state: AuthState
  signIn: (email: string, password: string) => Promise<ApiResult<Account>>
  /** True once the session has ended on the server. */
  signOut: () => Promise<boolean>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
