/** Same-origin JSON calls to our API. Errors come back as codes, which the pages translate. */
export type ApiResult<T = unknown> =
  | { ok: true; status: number; data: T | null }
  | { ok: false; status: number; code: string; fieldErrors: Record<string, string>; details: ProblemDetails }

/** Extra facts some errors carry, such as what still uses a record that can't be deleted (409 in_use). */
export type ProblemDetails = { usedBy?: Record<string, number> }

type ProblemBody = {
  code?: string
  usedBy?: Record<string, number>
  errors?: { field: string; code: string }[]
  properties?: { code?: string; errors?: { field: string; code: string }[] }
}

const CODE_BY_STATUS: Record<number, string> = {
  401: 'signed_out',
  413: 'request_too_large',
  429: 'rate_limited',
  503: 'busy',
}

/** The API sets this cookie; we echo it in a header to prove the request came from our own pages (CSRF). */
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

/** The current CSRF token, asking the API for one first if we don't have it yet. */
async function csrfToken(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE)
  if (existing) return existing
  try {
    await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
  } catch {
    return null // the real request will fail too, and report the network error
  }
  return readCookie(CSRF_COOKIE)
}

async function send<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin' })
  } catch {
    return { ok: false, status: 0, code: 'network_error', fieldErrors: {}, details: {} }
  }
  if (response.ok) {
    let data: T | null = null
    if (response.status !== 204) {
      try {
        data = (await response.json()) as T
      } catch {
        // No body (e.g. 202 Accepted)
      }
    }
    return { ok: true, status: response.status, data }
  }

  let problem: ProblemBody = {}
  try {
    problem = (await response.json()) as ProblemBody
  } catch {
    // Not JSON: fall back to the status code
  }
  const errors = problem.errors ?? problem.properties?.errors ?? []
  const fieldErrors: Record<string, string> = {}
  for (const error of errors) {
    fieldErrors[error.field] ??= error.code
  }
  return {
    ok: false,
    status: response.status,
    code: problem.code ?? problem.properties?.code ?? CODE_BY_STATUS[response.status] ?? 'unexpected',
    fieldErrors,
    details: usedByOf(problem.usedBy),
  }
}

/** Only counts by kind, such as {"authors": 3}: anything else in the body is ignored. */
function usedByOf(value: unknown): ProblemDetails {
  if (typeof value !== 'object' || value === null) return {}
  const usedBy: Record<string, number> = {}
  for (const [kind, count] of Object.entries(value)) {
    if (/^[a-z]+$/.test(kind) && Number.isInteger(count) && (count as number) > 0) usedBy[kind] = count as number
  }
  return Object.keys(usedBy).length > 0 ? { usedBy } : {}
}

export async function getJson<T>(path: string): Promise<ApiResult<T>> {
  return send<T>(path, { method: 'GET', headers: { Accept: 'application/json' } })
}

/**
 * POSTs JSON. Every POST carries the CSRF token when we have one; `csrf: true` makes sure we have one
 * first (needed for sign-in, sign-out and anything done while signed in).
 */
export async function postJson<T = unknown>(
  path: string,
  body?: unknown,
  options: { csrf?: boolean } = {},
): Promise<ApiResult<T>> {
  return change<T>('POST', path, body, options.csrf ?? false)
}

/**
 * Saves an edit to a library record. `version` is the version the edit started from: the API refuses the edit
 * (409 stale_version) if the record was changed in the meantime, for example on another device. `null` for the
 * few things where the newest change simply wins (a bookmark, the library settings).
 */
export async function putJson<T = unknown>(path: string, body: unknown, version: number | null): Promise<ApiResult<T>> {
  return change<T>('PUT', path, body, true, version === null ? undefined : `"${version}"`)
}

export async function deleteJson(path: string): Promise<ApiResult> {
  return change('DELETE', path, undefined, true)
}

async function change<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  ensureCsrf: boolean,
  ifMatch?: string,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}
  if (method !== 'DELETE') headers['Content-Type'] = 'application/json'
  const token = ensureCsrf ? await csrfToken() : readCookie(CSRF_COOKIE)
  if (token) headers[CSRF_HEADER] = token
  if (ifMatch) headers['If-Match'] = ifMatch
  return send<T>(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
