// De offline snapshot: alles wat de app zonder verbinding toont, in één antwoord
// (app/models/offline_snapshot.rb). Met If-None-Match: is er niets veranderd, dan zegt de
// server 304 (zonder body) en houden we onze kopie.
import { errorFor, fetchWithTimeout, networkError } from '@/api/client'
import { handleServerVersion, VERSION_HEADER } from '@/version'

// etag: van de vorige keer, of null. Geeft { notModified: true } of { data, etag }.
// Niet via request(): die ziet een 304 als fout (response.ok is alleen 2xx).
export async function fetchOfflineSnapshot(etag = null) {
  let response
  try {
    response = await fetchWithTimeout('/api/offline_snapshot', {
      // Zelf de ETag meesturen, niet de HTTP-cache van de browser laten beslissen.
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) },
    })
  } catch {
    throw networkError()
  }
  handleServerVersion(response.headers.get(VERSION_HEADER))
  if (response.status === 304) return { notModified: true }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw errorFor(response, body)
  return { data: body, etag: response.headers.get('ETag') }
}
