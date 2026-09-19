// Fetch wrapper for the UrbanMend API (docs/04-api-specification.md).
//
// Contract notes baked in here:
// - Base path /api/v1, JSON bodies already camelCase on the wire.
// - Auth is a session cookie; unsafe methods additionally need the Django CSRF
//   double-submit header (CSRF_COOKIE_HTTPONLY=False, so JS may read it).
// - Errors always come back as { error: { code, message, details, traceId } }.
// - 401 is UNAUTHENTICATED (DRF's default 403 rewrite is undone server-side).

export class ApiError extends Error {
  constructor(status, code, message, details = [], traceId = null) {
    super(message || 'Request failed')
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.traceId = traceId
  }
}

function readCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

/**
 * @param {string} path  e.g. '/reports' or '/users/me' — /api/v1 is prepended.
 * @param {{method?: string, body?: any, headers?: object}} options
 */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const finalHeaders = { ...headers }

  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('csrftoken')
    if (csrf) finalHeaders['X-CSRFToken'] = csrf
  }

  let response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: finalHeaders,
      // Session cookie — same-origin via the Vite proxy.
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (networkError) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.')
  }

  if (response.status === 204) return null

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected server response.')
    }
  }

  if (!response.ok) {
    const err = payload?.error ?? {}
    throw new ApiError(
      response.status,
      err.code ?? `HTTP_${response.status}`,
      err.message ?? 'Something went wrong.',
      err.details ?? [],
      err.traceId ?? null,
    )
  }

  return payload
}

/**
 * Multipart upload for POST /media (API §6.4). Same CSRF + envelope rules as
 * `api()`, but with a FormData body so the browser sets the boundary.
 */
export async function apiUpload(path, file) {
  const form = new FormData()
  form.append('file', file)

  const csrf = readCookie('csrftoken')

  let response
  try {
    response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrf ? { 'X-CSRFToken': csrf } : {},
      body: form,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.')
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected server response.')
    }
  }

  if (!response.ok) {
    const err = payload?.error ?? {}
    throw new ApiError(
      response.status,
      err.code ?? `HTTP_${response.status}`,
      err.message ?? 'Upload failed.',
      err.details ?? [],
      err.traceId ?? null,
    )
  }
  return payload
}

/**
 * Rewrites internal MinIO Docker storage URLs to relative URLs proxied by Vite.
 * Preserves the exact SigV4 query parameters.
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function normalizeMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://storage:9000/')) {
    return url.replace('http://storage:9000', '')
  }
  return url
}

