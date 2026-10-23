/** Same-origin JSON calls to our API. Errors come back as codes, which the pages translate. */
export type ApiResult =
  | { ok: true; status: number }
  | { ok: false; status: number; code: string; fieldErrors: Record<string, string> }

type ProblemBody = {
  code?: string
  errors?: { field: string; code: string }[]
  properties?: { code?: string; errors?: { field: string; code: string }[] }
}

const CODE_BY_STATUS: Record<number, string> = {
  413: 'request_too_large',
  429: 'rate_limited',
  503: 'busy',
}

export async function postJson(path: string, body: unknown): Promise<ApiResult> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    return { ok: false, status: 0, code: 'network_error', fieldErrors: {} }
  }
  if (response.ok) {
    return { ok: true, status: response.status }
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
  }
}
