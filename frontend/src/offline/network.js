// Is er verbinding? navigator.onLine is alleen betrouwbaar als hij false zegt: true
// betekent "er is een netwerk", niet "de server is bereikbaar". Daarom kijken we ook
// naar mislukte requests (isNetworkError).

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

// "14:05": het tijdstip van een snapshot, voor de offline-melding.
export function formatSavedAt(savedAt) {
  return new Date(savedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
