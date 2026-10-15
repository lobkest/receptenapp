// Gedeelde basis voor alle API-modules (recipes.js, variations.js, admin.js, shoppingList.js,
// standardItems.js).
// URL's zijn relatief (/api/...): in development vangt de Vite-proxy ze op,
// in productie serveert Rails de frontend zelf op hetzelfde domein.

export class ApiError extends Error {
  // kind: 'network' | 'unauthorized' | 'not_found' | 'conflict' | 'validation' | 'rate_limited' | 'server'
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

  // Elke fout van de API heeft dezelfde vorm (app/controllers/concerns/api_errors.rb):
  // { error: 'Nederlandse melding', errors: { veld: ['melding zonder veldnaam'] } }.
  // Dit is de enige plek die dat uitleest. Formulieren tonen errors bij elk veld; de rest
  // toont message. Zonder body (bijv. een proxy ervoor) valt message terug op FALLBACK.
  const [kind, fallback] = STATUSES[response.status] ?? SERVER_ERROR
  // Bij een 500 nooit de servertekst: dat kan een technische melding zijn.
  const message = kind === 'server' ? fallback : (body.error ?? fallback)
  throw new ApiError(kind, message, { status: response.status, errors: body.errors ?? {} })
}

const SERVER_ERROR = ['server', 'Er ging iets mis op de server.']

// HTTP-status → [kind, Nederlandse melding als de server er geen meestuurt].
const STATUSES = {
  // Er ontbrak iets in het verzoek (bijv. lock_version); errors noemt het veld.
  400: ['validation', 'Controleer de ingevulde velden.'],
  401: ['unauthorized', 'De beheercode is onjuist of verlopen.'],
  404: ['not_found', 'Niet gevonden.'],
  // Iemand anders heeft het intussen gewijzigd (lock_version).
  409: ['conflict', 'Dit is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.'],
  422: ['validation', 'Controleer de ingevulde velden.'],
  // De server zegt hoe lang je moet wachten (bij beheer: een minuut).
  429: ['rate_limited', 'Te veel verzoeken. Probeer het later opnieuw.'],
}
