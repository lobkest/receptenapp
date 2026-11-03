// Opslag voor offline: IndexedDB (via idb-keyval), met een kopie in het geheugen.
//
// IndexedDB is asynchroon, maar de stores willen gewoon "lees de wachtrij" kunnen zeggen.
// Daarom laadt initStorage() bij het starten (main.js, vóór app.mount) alles één keer in
// het geheugen. Daarna leest readJson uit het geheugen (synchroon) en schrijft writeJson
// naar allebei: het geheugen meteen, IndexedDB op de achtergrond. Vergelijk het met een
// write-through cache. IndexedDB voert schrijfacties op dezelfde store in volgorde uit.
//
// Lukt IndexedDB niet (privé-venster, uitgezet, opslag vol), dan blijft alles in het
// geheugen: de app werkt, alleen is het weg na herladen. Alleen kopieën en de wachtrij: de
// database op de server blijft de bron van waarheid.
//
// Eerder stond dit in localStorage (sleutels met PREFIX). initStorage() zet dat één keer
// over naar IndexedDB en ruimt de oude sleutels daarna op.
import { createStore, del, entries, set } from 'idb-keyval'

const DB_NAME = 'receptenapp'
const STORE_NAME = 'offline'
// De voorvoegsel van de oude localStorage-sleutels ("receptenapp:offline:shoppingList:queue").
export const LEGACY_PREFIX = 'receptenapp:offline:'

// sleutel → JSON-tekst. Tekst, geen object: elke readJson geeft een eigen kopie, zodat een
// store die de data aanpast (reactief maken, sorteren) de opgeslagen versie niet verandert.
const memory = new Map()
// De idb-keyval-store, of null zonder (werkende) IndexedDB.
let idbStore = null
let persistRequested = false

// Bij het starten, één keer: wat in IndexedDB staat naar het geheugen, en de oude
// localStorage-gegevens erbij. Gooit nooit.
export async function initStorage() {
  memory.clear()
  try {
    if (typeof indexedDB === 'undefined') throw new Error('geen IndexedDB')
    idbStore = createStore(DB_NAME, STORE_NAME)
    for (const [key, raw] of await entries(idbStore)) memory.set(key, raw)
  } catch {
    idbStore = null
  }
  await migrateLocalStorage()
}

// De oude localStorage-sleutels over naar IndexedDB. Staat dezelfde sleutel al in
// IndexedDB, dan wint die (die is nieuwer). Pas als het schrijven gelukt is, gaat de oude
// sleutel weg; zonder IndexedDB blijft hij staan voor een volgende keer.
async function migrateLocalStorage() {
  let keys
  try {
    keys = Object.keys(localStorage).filter((key) => key.startsWith(LEGACY_PREFIX))
  } catch {
    return
  }
  for (const fullKey of keys) {
    const key = fullKey.slice(LEGACY_PREFIX.length)
    try {
      const raw = localStorage.getItem(fullKey)
      if (!memory.has(key) && raw != null) {
        memory.set(key, raw)
        if (!idbStore) continue
        await set(key, raw, idbStore)
      }
      if (idbStore) localStorage.removeItem(fullKey)
    } catch {
      // Deze sleutel een volgende keer opnieuw.
    }
  }
}

// Geeft de opgeslagen waarde terug, of null als er niets (bruikbaars) staat.
export function readJson(key) {
  const raw = memory.get(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    // Kapotte data (bijv. half geschreven): alsof er niets stond.
    return null
  }
}

// Meteen in het geheugen, en op de achtergrond in IndexedDB. Geeft een belofte die true
// geeft als het in IndexedDB staat, false als het alleen in het geheugen staat (gooit nooit).
export function writeJson(key, value) {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  if (!idbStore) return Promise.resolve(false)
  requestPersistence()
  return set(key, raw, idbStore).then(
    () => true,
    () => false,
  )
}

export function removeKey(key) {
  memory.delete(key)
  if (!idbStore) return Promise.resolve(false)
  return del(key, idbStore).then(
    () => true,
    () => false,
  )
}

// De eerste keer dat we iets bewaren: vraag de browser om de opslag niet zomaar op te
// ruimen als de schijf vol raakt (navigator.storage.persist). Weigert hij, dan is dat ook
// goed: dan blijft het gewone gedrag, en de server heeft alles nog.
function requestPersistence() {
  if (persistRequested) return
  persistRequested = true
  try {
    navigator.storage?.persist?.().catch(() => {})
  } catch {
    // Geen storage-API: niets te vragen.
  }
}

// Voor tests: het geheugen leeg (zonder IndexedDB aan te raken). Met daarna initStorage()
// is het alsof de pagina opnieuw geladen is.
export function clearMemoryStorage() {
  memory.clear()
  persistRequested = false
}
