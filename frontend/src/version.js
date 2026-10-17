// Draait deze browser nog een oude bundel? Rails stuurt bij elke API-response de versie
// van de frontend die erbij hoort mee (X-App-Version, zie lib/app_version.rb); deze bundel
// weet zijn eigen versie (__APP_VERSION__, uit vite.config.js). Verschillen ze, dan is er
// intussen een nieuwe deploy: oude JavaScript naast een nieuwe API geeft rare fouten
// (geen tags, een filter zonder resultaten). Dan herladen we, met de nieuwe versie.

/* global __APP_VERSION__ */
export const APP_VERSION = __APP_VERSION__

export const VERSION_HEADER = 'X-App-Version'

// Per tabblad: voor welke serverversie we al herladen hebben. Zo herlaadt een tabblad
// nooit eindeloos, ook als er na herladen nog steeds een andere versie staat.
const RELOADED_KEY = 'receptenapp:reloaded-for-version'

let reloading = false

// Is serverVersion een andere versie dan deze bundel? Zonder header (development,
// tests, een oude server) nooit.
export function isOutdated(serverVersion, current = APP_VERSION) {
  return Boolean(serverVersion) && serverVersion !== current
}

// Aangeroepen door src/api/client.js met de header van elke response. In development
// (`npm run dev`) nooit: daar is er geen build en dus geen vaste versie.
export function handleServerVersion(serverVersion, { reload = reloadToLatest } = {}) {
  if (import.meta.env.DEV || reloading || !isOutdated(serverVersion)) return false
  if (readReloadedFor() === serverVersion) return false
  writeReloadedFor(serverVersion)
  reloading = true
  reload()
  return true
}

// Haalt eerst de nieuwe service worker op (anders geeft de oude bij herladen weer de oude
// index.html uit zijn cache) en herlaadt dan. Een nieuwe service worker wordt meteen actief
// (skipWaiting) en registerSW() in main.js herlaadt dan zelf; dit is de terugval.
async function reloadToLatest() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
    const incoming = registration?.installing ?? registration?.waiting
    if (incoming) await activated(incoming, 10_000)
  } catch {
    // Geen service worker of geen netwerk: gewoon herladen.
  }
  window.location.reload()
}

function activated(worker, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

function readReloadedFor() {
  try {
    return sessionStorage.getItem(RELOADED_KEY)
  } catch {
    return null
  }
}

function writeReloadedFor(version) {
  try {
    sessionStorage.setItem(RELOADED_KEY, version)
  } catch {
    // Zonder opslag herladen we toch; reloading voorkomt een tweede keer in deze pagina.
  }
}

// Voor tests.
export function resetVersionCheck() {
  reloading = false
}
