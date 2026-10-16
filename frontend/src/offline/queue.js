// Een wachtrij met acties die offline zijn gedaan en nog naar de server moeten.
//
// Elke actie zet een waarde ("afgevinkt = true"), nooit "draai om": zo maakt het niet
// uit of hij één of twee keer aankomt. Per ding (idOf) bewaren we alleen de laatste
// actie: vink je iets af en weer aan, dan gaat alleen "niet afgevinkt" naar de server.
import { readJson, writeJson } from './storage'

export function createActionQueue(key, { idOf }) {
  const storageKey = `${key}:queue`
  // Een lopende flush(), zodat 'online' en terugkeren naar de app niet dubbel versturen.
  let pendingFlush = null

  function all() {
    const actions = readJson(storageKey)
    return Array.isArray(actions) ? actions : []
  }

  function save(actions) {
    writeJson(storageKey, actions)
  }

  function enqueue(action) {
    save([...all().filter((a) => idOf(a) !== idOf(action)), action])
  }

  function discard(id) {
    save(all().filter((a) => idOf(a) !== id))
  }

  // Haalt deze actie weg, maar niet als er intussen een nieuwere voor hetzelfde ding staat.
  function done(action) {
    save(all().filter((a) => !(idOf(a) === idOf(action) && a.at === action.at)))
  }

  // Verstuurt de acties één voor één, in volgorde, met send(action) (een promise).
  // Een 404 (bestaat niet meer op de server) slaan we over: weg is weg. Bij elke andere
  // fout (geen netwerk, server stuk) stoppen we en gooien we die door; de rest blijft
  // staan voor de volgende keer. Geeft { sent, skipped } terug.
  function flush(send) {
    if (pendingFlush) return pendingFlush
    pendingFlush = (async () => {
      const result = { sent: 0, skipped: 0 }
      for (const action of all()) {
        try {
          await send(action)
          result.sent++
        } catch (e) {
          if (e?.kind !== 'not_found') throw e
          result.skipped++
        }
        done(action)
      }
      return result
    })().finally(() => (pendingFlush = null))
    return pendingFlush
  }

  return {
    all,
    enqueue,
    discard,
    flush,
    get size() {
      return all().length
    },
  }
}
