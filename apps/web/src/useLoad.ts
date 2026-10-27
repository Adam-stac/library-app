import { useCallback, useEffect, useState } from 'react'
import { getJson } from './api'
import { useAuth } from './auth/context'

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'notFound' }
  | { status: 'failed' }

/**
 * Loads one thing from the API for a page, signed-in accounts only, and loads it again when the address changes.
 * A missing record (or someone else's: the API answers 404 for those) is `notFound`; being signed out sends the
 * account state round again, which takes the page to sign-in. `null` loads nothing.
 */
export function useLoad<T>(path: string | null): [Loaded<T>, { reload: () => void; replace: (data: T) => void }] {
  const { state, refresh } = useAuth()
  const [result, setResult] = useState<{ path: string; round: number; loaded: Loaded<T> } | null>(null)
  const [round, setRound] = useState(0)
  const signedIn = state.status === 'signedIn'

  useEffect(() => {
    if (!signedIn || path === null) return
    let current = true
    void getJson<T>(path).then((response) => {
      if (!current) return
      if (response.ok && response.data !== null) {
        setResult({ path, round, loaded: { status: 'ok', data: response.data } })
      } else if (!response.ok && response.status === 401) {
        void refresh()
      } else {
        const missing = !response.ok && (response.status === 404 || response.status === 400)
        setResult({ path, round, loaded: { status: missing ? 'notFound' : 'failed' } })
      }
    })
    return () => {
      current = false
    }
  }, [signedIn, path, round, refresh])

  const reload = useCallback(() => setRound((n) => n + 1), [])
  const replace = useCallback(
    (data: T) => {
      if (path !== null) setResult({ path, round, loaded: { status: 'ok', data } })
    },
    [path, round],
  )

  // Until the answer for this address arrives, the page shows nothing rather than the last address's data
  const loaded: Loaded<T> = result && result.path === path ? result.loaded : { status: 'loading' }
  return [loaded, { reload, replace }]
}
