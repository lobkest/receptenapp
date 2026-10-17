import { defineStore } from 'pinia'
import { isOffline } from '@/offline'

// Is de server er? De gratis Render-server slaapt na een kwartier zonder bezoek; het eerste
// verzoek daarna wacht tot hij wakker is (soms een minuut). Zolang hij niet online is,
// tonen de pagina's met meta.needsServer (router) een laadmelding in plaats van oude data
// (App.vue); de boodschappenlijst toont dan zijn offline kopie.
//
// status:
// - 'waking':  nog geen antwoord (of een 5xx/time-out): de server start op
// - 'online':  GET /up (de health check van Rails) gaf 200
// - 'offline': geen verbinding (de browser meldt offline, of de server is onbereikbaar)
// Zolang hij niet online is, proberen we het opnieuw, steeds wat later (backoff).

const UP_URL = '/up'
// Per verzoek: een slapende server houdt het verzoek vast; na zoveel ms proberen we opnieuw.
export const PING_TIMEOUT_MS = 10_000
// Was hij al online (terug naar het tabblad)? Dan blijft de pagina staan, tenzij het
// antwoord zo lang uitblijft: dan sliep hij intussen.
export const SLOW_MS = 2_000
// Wachttijd vóór de 1e, 2e, ... herhaling; daarna steeds de laatste.
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000]

let retryTimer = null
let attempt = 0
// Een lopende check(), zodat start, 'online' en terug naar het tabblad niet dubbel pingen.
let pendingCheck = null

// Eén ping: 'online', 'waking' (5xx of time-out) of 'offline' (fetch faalt meteen:
// geen netwerk, server onbereikbaar).
async function ping() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
  try {
    const response = await fetch(UP_URL, { cache: 'no-store', signal: controller.signal })
    return response.ok ? 'online' : 'waking'
  } catch {
    return controller.signal.aborted ? 'waking' : 'offline'
  } finally {
    clearTimeout(timer)
  }
}

export const useServerStatusStore = defineStore('serverStatus', {
  state: () => ({
    status: 'waking',
    // navigator.onLine === false, bijgehouden via de 'online'/'offline'-events (App.vue).
    // Alleen dan is het echt "Offline"; anders proberen we nog.
    browserOffline: isOffline(),
  }),

  getters: {
    online: (state) => state.status === 'online',
  },

  actions: {
    // Bij het starten, terug naar het tabblad en als de verbinding terugkomt: meteen
    // pingen, met de backoff weer vanaf het begin.
    start() {
      this.stopRetrying()
      return this.check()
    },

    async check() {
      if (pendingCheck) return pendingCheck
      clearTimeout(retryTimer)
      this.browserOffline = isOffline()
      if (this.browserOffline) {
        this.status = 'offline'
        this.scheduleRetry()
        return
      }
      const slowTimer =
        this.status === 'online' ? setTimeout(() => (this.status = 'waking'), SLOW_MS) : null
      pendingCheck = ping()
        .then((result) => {
          clearTimeout(slowTimer)
          this.status = result
          if (result === 'online') attempt = 0
          else this.scheduleRetry()
        })
        .finally(() => (pendingCheck = null))
      return pendingCheck
    },

    scheduleRetry() {
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
      attempt++
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => this.check(), delay)
    },

    stopRetrying() {
      clearTimeout(retryTimer)
      retryTimer = null
      attempt = 0
    },

    // De browser meldt dat de verbinding weg is ('offline'-event).
    markOffline() {
      this.browserOffline = true
      this.status = 'offline'
    },
  },
})

// Voor tests: alles terug naar het begin.
export function resetServerStatus() {
  clearTimeout(retryTimer)
  retryTimer = null
  attempt = 0
  pendingCheck = null
}
