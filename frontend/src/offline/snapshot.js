// Een snapshot: de laatste stand van de server, met het tijdstip waarop die opgehaald (of
// bevestigd) is. Bij openen toon je hem meteen, en daarna ververs je online
// (stale-while-revalidate). Offline is het alles wat er is.
import { readJson, writeJson } from './storage'

export function saveSnapshot(key, data, savedAt = Date.now()) {
  return writeJson(`${key}:snapshot`, { savedAt, data })
}

// Geeft { data, savedAt } terug, of null als er geen (geldige) snapshot is.
export function loadSnapshot(key) {
  const snapshot = readJson(`${key}:snapshot`)
  if (!snapshot || typeof snapshot.savedAt !== 'number' || !('data' in snapshot)) return null
  return snapshot
}
