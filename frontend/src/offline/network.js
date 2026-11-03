// Is er verbinding? navigator.onLine is alleen betrouwbaar als hij false zegt: true
// betekent "er is een netwerk", niet "de server is bereikbaar". Daarom kijken we ook
// naar mislukte requests (isNetworkError).

// Bij knoppen die zonder verbinding uit staan (components/OfflineHint.vue, title-attribuut).
export const OFFLINE_TEXT = 'Niet beschikbaar zonder verbinding'

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Een ApiError van src/api/client.js die zegt dat de server niet te bereiken was.
export function isNetworkError(error) {
  return error?.kind === 'network'
}

// Roept onOnline/onOffline aan als de browser de verbinding ziet komen of gaan.
// Geeft een functie terug die weer stopt met luisteren.
export function watchConnectivity({ onOnline = () => {}, onOffline = () => {} }) {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

// Middernacht (lokale tijd) van de dag waarop timestamp valt.
function startOfDay(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Wanneer een kopie van de server kwam, voor de offline-melding:
// - dezelfde kalenderdag: "vandaag 18:00"
// - de dag ervoor: "gisteren 18:00"
// - ouder: "2 dagen geleden", "3 dagen geleden", … (zonder tijd)
// In kalenderdagen in de lokale tijd van het apparaat, niet in blokken van 24 uur: om 00:10
// is een kopie van 23:50 al "gisteren". Math.round vangt de zomer- en wintertijd op (een dag
// van 23 of 25 uur). Een tijdstip in de toekomst (klok verzet) telt als vandaag.
export function formatSavedAt(savedAt, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(savedAt)) / DAY_MS)
  if (days >= 2) return `${days} dagen geleden`
  const date = new Date(savedAt)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${days === 1 ? 'gisteren' : 'vandaag'} ${time}`
}

// Het oudste tijdstip van de opgeslagen datasets die een pagina toont (null telt niet mee),
// of null als er geen enkele is.
export function oldestSavedAt(...savedAts) {
  const known = savedAts.filter((savedAt) => typeof savedAt === 'number')
  return known.length ? Math.min(...known) : null
}
