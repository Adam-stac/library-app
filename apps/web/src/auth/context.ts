import { createContext, useContext } from 'react'
import type { ApiResult } from '../api'

export type Account = { email: string; language: string }

/** What signing in returns: the account, or `secondStepRequired` when a code from the app is needed next. */
export type SignInResult = { email: string | null; language: string | null; secondStepRequired?: boolean }

export type AuthState =
  | { status: 'loading' } // still asking the API whether we're signed in
  | { status: 'signedOut' }
  | { status: 'signedIn'; account: Account }

export type Auth = {
  state: AuthState
  signIn: (email: string, password: string) => Promise<ApiResult<SignInResult>>
  /** The second step of signing in: a code from the authenticator app, or a recovery code. */
  completeSecondStep: (code: string) => Promise<ApiResult<SignInResult>>
  /** Signs in with a passkey: no password or code needed. */
  signInWithPasskey: () => Promise<ApiResult<SignInResult>>
  /** True once the session has ended on the server. */
  signOut: () => Promise<boolean>
  /** Asks the API again, e.g. after a password reset has ended every session. */
  refresh: () => Promise<void>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
