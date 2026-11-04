// Gedeelde basis voor alle API-modules (recipes.js, variations.js, ingredients.js, pantry.js,
// admin.js, shoppingList.js, standardItems.js).
// URL's zijn relatief (/api/...): in development vangt de Vite-proxy ze op,
// in productie serveert Rails de frontend zelf op hetzelfde domein.
import { handleServerVersion, VERSION_HEADER } from '@/version'

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

// Zonder antwoord na zoveel ms geeft een verzoek een netwerkfout, zoals zonder verbinding.
// Een telefoon zonder bereik laat een verzoek anders minutenlang hangen (fetch faalt dan
// niet); met de fout tonen de pagina's hun offline kopie of de offline-melding.
export const REQUEST_TIMEOUT_MS = 20_000

// fetch met REQUEST_TIMEOUT_MS. Gooit bij een time-out net als fetch zonder netwerk.
export async function fetchWithTimeout(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(path, { signal: controller.signal, ...options })
  } finally {
    clearTimeout(timer)
  }
}

// Een verzoek kwam niet aan. Meldt het ook aan de app (NETWORK_ERROR_EVENT): valt het bereik
// weg zonder 'offline'-event van de browser, dan pingt App.vue meteen opnieuw en geldt de app
// zo snel mogelijk als offline (stores/serverStatus.js).
export const NETWORK_ERROR_EVENT = 'receptenapp:network-error'

export function networkError() {
  window.dispatchEvent(new Event(NETWORK_ERROR_EVENT))
  return new ApiError('network', 'Kan de server niet bereiken.')
}

export async function request(path, options = {}) {
  let response
  try {
    response = await fetchWithTimeout(path, {
      // Altijd vers van de server, nooit uit de HTTP-cache van de browser. De service
      // worker cachet /api ook niet (vite.config.js); de app bewaart zelf een kopie voor
      // offline (src/offline/, in IndexedDB).
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    // fetch gooit alleen bij netwerkproblemen (server uit, geen internet, time-out),
    // niet bij HTTP-fouten zoals 404 of 500.
    throw networkError()
  }

  // Een nieuwere deploy op de server? Dan herlaadt de pagina met de nieuwe bundel.
  handleServerVersion(response.headers.get(VERSION_HEADER))

  // Bij een fout of een 204 kan de body leeg of geen JSON zijn; dan gebruiken we een leeg object.
  const body = await response.json().catch(() => ({}))

  if (response.ok) return body
  throw errorFor(response, body)
}

// De ApiError bij een antwoord dat geen 2xx is; body: de JSON van dat antwoord (of {}).
// Ook voor api/offline.js, dat fetch zelf doet (vanwege 304).
export function errorFor(response, body) {
  // Elke fout van de API heeft dezelfde vorm (app/controllers/concerns/api_errors.rb):
  // { error: 'Nederlandse melding', errors: { veld: ['melding zonder veldnaam'] } }.
  // Dit is de enige plek die dat uitleest. Formulieren tonen errors bij elk veld; de rest
  // toont message. Zonder body (bijv. een proxy ervoor) valt message terug op FALLBACK.
  const [kind, fallback] = STATUSES[response.status] ?? SERVER_ERROR
  // Bij een 500 nooit de servertekst: dat kan een technische melding zijn.
  const message = kind === 'server' ? fallback : (body.error ?? fallback)
  return new ApiError(kind, message, { status: response.status, errors: body.errors ?? {} })
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
