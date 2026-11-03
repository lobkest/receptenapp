// Offline-ondersteuning, los van een bepaalde lijst:
// - storage: IndexedDB met een kopie in het geheugen (initStorage bij het starten)
// - snapshot: laatste stand van de server + tijdstip
// - outbox: offline wijzigingen die bij verbinding alsnog naar de server gaan
// - network: is er verbinding, en luisteren naar 'online'/'offline'
// De opslag is alleen een kopie plus wachtrij; de database blijft de bron van waarheid.
import { createOutbox } from './outbox'
import { initStorage, readJson, removeKey } from './storage'

export { saveSnapshot, loadSnapshot } from './snapshot'
export { createOutbox, isTempId, newId, tempId } from './outbox'
export {
  isOffline,
  isNetworkError,
  watchConnectivity,
  formatSavedAt,
  oldestSavedAt,
  OFFLINE_TEXT,
} from './network'

// De sleutel van de outbox van de hele app (stores/offline.js).
export const OUTBOX_KEY = 'outbox'
// De oude wachtrij van de boodschappenlijst (alleen afstrepen): [{ item_id, checked, at }].
const LEGACY_QUEUE_KEY = 'shoppingList:queue'

// Bij het starten, vóór app.mount (main.js): de opslag laden en wat er nog in de oude
// wachtrij stond, overzetten naar de outbox (als "zet afgestreept", net als toen).
export async function initOffline() {
  await initStorage()
  const legacy = readJson(LEGACY_QUEUE_KEY)
  if (Array.isArray(legacy)) {
    const outbox = createOutbox(OUTBOX_KEY)
    for (const action of legacy) {
      if (action?.item_id == null || typeof action.checked !== 'boolean') continue
      outbox.enqueue({
        type: 'shopping.check',
        kind: 'set',
        target: `shopping:${action.item_id}`,
        payload: { checked: action.checked },
        at: action.at,
      })
    }
  }
  if (legacy != null) await removeKey(LEGACY_QUEUE_KEY)
}
