import { defineStore } from 'pinia'
import { isOffline } from '@/offline'

// Is de server er? De gratis Render-server slaapt na een kwartier zonder bezoek; het eerste
// verzoek daarna wacht tot hij wakker is (soms een minuut). Zolang hij niet online is,
// tonen de pagina's met meta.needsServer (router) een laadmelding in plaats van oude data
// (App.vue); de boodschappenlijst toont dan zijn offline kopie.
//
// status:
// - 'waking':  nog geen antwoord, of een 5xx: de server start op
// - 'online':  GET /up (de health check van Rails) gaf 200
// - 'offline': geen verbinding: de browser meldt offline, fetch faalt meteen, of /up blijft
//              PING_TIMEOUT_MS hangen. Dat laatste is een telefoon zonder bereik (requests
//              blijven hangen in plaats van te falen). Een slapende Render-server laat /up
//              ook hangen; de browser ziet geen verschil (Rails serveert ook de frontend).
//              Dan tonen we eerlijk "geen verbinding" en zodra hij antwoordt is hij online.
// Zolang hij niet online is, proberen we het opnieuw, steeds wat later (backoff).

const UP_URL = '/up'
// Per ping: zonder antwoord na zoveel ms geldt de app als offline, en proberen we opnieuw.
export const PING_TIMEOUT_MS = 8_000
// Was hij al online (terug naar het tabblad)? Dan blijft de pagina staan, tenzij het
// antwoord zo lang uitblijft: dan sliep hij intussen.
export const SLOW_MS = 2_000
// Wachttijd vóór de 1e, 2e, ... herhaling; daarna steeds de laatste.
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000]

let retryTimer = null
let slowTimer = null
let attempt = 0
// Een lopende check(), zodat start, 'online' en terug naar het tabblad niet dubbel pingen.
let pendingCheck = null
// Nummer van de laatst gestarte ping. Alleen het antwoord van die ping telt: valt de
// verbinding weg terwijl een ping onderweg is (markOffline), dan komt het antwoord van vóór
// dat moment soms nog binnen. Dat mag de status niet meer op 'online' zetten.
let latestPing = 0

// Eén ping: 'online', 'waking' (5xx) of 'offline' (fetch faalt, of geen antwoord binnen
// PING_TIMEOUT_MS: geen netwerk, geen bereik, server onbereikbaar).
async function ping() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
  try {
    const response = await fetch(UP_URL, { cache: 'no-store', signal: controller.signal })
    return response.ok ? 'online' : 'waking'
  } catch {
    return 'offline'
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
    // Geen verbinding (de browser meldt offline, of de server is niet te bereiken): dan
    // zijn knoppen die iets op de server moeten veranderen uit, behalve wat via de outbox
    // kan (stores/offline.js). Een server die nog wakker wordt telt niet als offline.
    offline: (state) => state.browserOffline || state.status === 'offline',
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
      const id = ++latestPing
      clearTimeout(slowTimer)
      slowTimer =
        this.status === 'online' ? setTimeout(() => (this.status = 'waking'), SLOW_MS) : null
      const check = ping()
        .then((result) => {
          if (id !== latestPing) return
          clearTimeout(slowTimer)
          this.status = result
          if (result === 'online') attempt = 0
          else this.scheduleRetry()
        })
        .finally(() => {
          if (pendingCheck === check) pendingCheck = null
        })
      pendingCheck = check
      return check
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

    // De browser meldt dat de verbinding weg is ('offline'-event). Een ping die nog onderweg
    // is, telt niet meer; de volgende check() start een nieuwe.
    markOffline() {
      latestPing++
      pendingCheck = null
      clearTimeout(slowTimer)
      this.browserOffline = true
      this.status = 'offline'
    },
  },
})

// Voor tests: alles terug naar het begin.
export function resetServerStatus() {
  clearTimeout(retryTimer)
  clearTimeout(slowTimer)
  retryTimer = null
  slowTimer = null
  latestPing = 0
  attempt = 0
  pendingCheck = null
}
