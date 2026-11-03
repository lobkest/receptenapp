// Een snapshot: de laatste stand van de server, met het tijdstip waarop die opgehaald (of
// bevestigd) is. Bij openen toon je hem meteen, en daarna ververs je online
// (stale-while-revalidate). Offline is het alles wat er is.
import { readJson, writeJson } from './storage'

// meta: wat er verder bij hoort, bijv. { etag } voor de volgende If-None-Match.
export function saveSnapshot(key, data, savedAt = Date.now(), meta = {}) {
  return writeJson(`${key}:snapshot`, { ...meta, savedAt, data })
}

// Geeft { data, savedAt, ...meta } terug, of null als er geen (geldige) snapshot is.
export function loadSnapshot(key) {
  const snapshot = readJson(`${key}:snapshot`)
  if (!snapshot || typeof snapshot.savedAt !== 'number' || !('data' in snapshot)) return null
  return snapshot
}
