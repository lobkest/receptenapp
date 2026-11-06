import { defineStore } from 'pinia'
import { isOffline } from '@/offline'

// Is de server er? De gratis Render-server slaapt na een kwartier zonder bezoek; het eerste
// verzoek daarna wacht tot hij wakker is (soms een minuut). Zolang hij niet online is, geldt
// de app als offline (getter offline): elke pagina toont de offline-melding met een teller
// (components/OfflineNotice.vue, offlineSince), de pagina's tonen hun offline kopie, en wat
// je toevoegt of afvinkt gaat meteen via de outbox (stores/offline.js), zonder netwerkverzoek.
// Pas als /up 200 geeft, gaat de outbox naar de server (App.vue).
//
// status:
// - 'waking':  nog geen antwoord, of een 5xx: de server start op (ook bij het starten van de
//              app, en terug naar de app als de ping langer dan SLOW_MS duurt)
// - 'online':  GET /up (de health check van Rails) gaf 200
// - 'offline': geen verbinding: de browser meldt offline, fetch faalt meteen, of /up blijft
//              PING_TIMEOUT_MS hangen. Dat laatste is een telefoon zonder bereik (requests
//              blijven hangen in plaats van te falen). Een slapende Render-server laat /up
//              ook hangen; de browser ziet geen verschil (Rails serveert ook de frontend).
//              Dan tonen we eerlijk "geen verbinding" en zodra hij antwoordt is hij online.
// Alleen 'online' is online; 'waking' en 'offline' tellen allebei als offline. Het verschil
// zit alleen in de tekst van de teller (browserOffline: "geen internet op dit toestel").
// Zolang hij niet online is, proberen we het opnieuw, steeds wat later (backoff).

const UP_URL = '/up'
// Per ping: zonder antwoord na zoveel ms geldt de app als offline, en proberen we opnieuw.
export const PING_TIMEOUT_MS = 8_000
// Was hij al online (terug naar het tabblad)? Dan blijft hij online, tenzij het antwoord zo
// lang uitblijft: dan sliep hij intussen en is de app offline tot /up antwoordt.
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
    // Sinds wanneer (Date.now(), ms) de server niet online is, voor de teller in de
    // offline-melding; null zolang hij online is. Bij het starten: meteen (status 'waking').
    offlineSince: Date.now(),
    // navigator.onLine === false, bijgehouden via de 'online'/'offline'-events (App.vue).
    // Alleen dan is het echt "Offline"; anders proberen we nog.
    browserOffline: isOffline(),
  }),

  getters: {
    online: (state) => state.status === 'online',
    // Alles wat niet online is: geen verbinding, de server is niet te bereiken, of hij wordt
    // nog wakker (ook in de eerste ogenblikken na het starten, tot /up antwoordt). Dan zijn
    // knoppen die iets op de server moeten veranderen uit, behalve wat via de outbox kan
    // (stores/offline.js), en tonen de pagina's de offline-melding.
    offline: (state) => state.status !== 'online',
  },

  actions: {
    // De status zetten, en offlineSince mee: gezet zodra hij niet meer online is (een al
    // lopende teller blijft doorlopen), gewist bij online.
    setStatus(status) {
      this.status = status
      if (status === 'online') this.offlineSince = null
      else this.offlineSince ??= Date.now()
    },

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
        this.setStatus('offline')
        this.scheduleRetry()
        return
      }
      const id = ++latestPing
      clearTimeout(slowTimer)
      slowTimer =
        this.status === 'online' ? setTimeout(() => this.setStatus('waking'), SLOW_MS) : null
      const check = ping()
        .then((result) => {
          if (id !== latestPing) return
          clearTimeout(slowTimer)
          this.setStatus(result)
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
      this.setStatus('offline')
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
