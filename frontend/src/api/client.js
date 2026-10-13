// Gedeelde basis voor alle API-modules (recipes.js en admin.js).
// URL's zijn relatief (/api/...): in development vangt de Vite-proxy ze op,
// in productie serveert Rails de frontend zelf op hetzelfde domein.

export class ApiError extends Error {
  // kind: 'network' | 'unauthorized' | 'not_found' | 'validation' | 'rate_limited' | 'server'
  constructor(kind, message, { status = null, errors = {} } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.errors = errors
  }
}

export async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    // fetch gooit alleen bij netwerkproblemen (server uit, geen internet),
    // niet bij HTTP-fouten zoals 404 of 500.
    throw new ApiError('network', 'Kan de server niet bereiken.')
  }

  // Bij een fout of een 204 kan de body leeg of geen JSON zijn; dan gebruiken we een leeg object.
  const body = await response.json().catch(() => ({}))

  if (response.ok) return body

  switch (response.status) {
    case 401:
      throw new ApiError('unauthorized', 'De beheercode is onjuist of verlopen.', { status: 401 })
    case 404:
      throw new ApiError('not_found', 'Niet gevonden.', { status: 404 })
    case 422:
      throw new ApiError('validation', 'Controleer de ingevulde velden.', {
        status: 422,
        errors: body.errors ?? {},
      })
    case 429:
      throw new ApiError('rate_limited', 'Te veel inzendingen. Probeer het later opnieuw.', {
        status: 429,
      })
    default:
      throw new ApiError('server', 'Er ging iets mis op de server.', { status: response.status })
  }
}
