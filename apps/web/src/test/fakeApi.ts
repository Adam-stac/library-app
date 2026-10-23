import { vi } from 'vitest'

export const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Handler = (init: RequestInit) => Response | Promise<Response>

/**
 * A fake API for component tests. /csrf sets the token cookie like the real one; /me answers from
 * `signedInAs` unless a handler is given; any other path must have a handler.
 */
export function fakeApi(handlers: Record<string, Handler>, signedInAs?: string) {
  const fetchMock = vi.fn((path: string, init: RequestInit = {}) => {
    if (handlers[path]) return Promise.resolve(handlers[path](init))
    if (path === '/api/v1/auth/me') {
      return Promise.resolve(signedInAs ? json(200, { email: signedInAs, language: 'en' }) : json(204))
    }
    if (path === '/api/v1/auth/csrf') {
      document.cookie = 'XSRF-TOKEN=csrf-123; path=/'
      return Promise.resolve(json(204))
    }
    return Promise.reject(new Error(`unexpected ${path}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function callTo(fetchMock: ReturnType<typeof fakeApi>, path: string): RequestInit {
  const call = fetchMock.mock.calls.find(([calledPath]) => calledPath === path)
  if (!call) throw new Error(`no call to ${path}`)
  return call[1] ?? {}
}

export function clearCsrfCookie() {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
}
