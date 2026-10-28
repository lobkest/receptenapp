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

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

// "28 okt om 14:05": wanneer een snapshot van de server kwam, voor de offline-melding. Met
// datum, want een kopie van gisteren is iets anders dan een van vanochtend. Het jaartal
// alleen als het niet dit jaar is ("3 dec 2025 om 09:41"). De maanden staan hier zelf,
// zodat het in elke browser hetzelfde is (toLocaleDateString geeft soms "okt.").
export function formatSavedAt(savedAt, now = Date.now()) {
  const date = new Date(savedAt)
  const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year} om ${time}`
}
