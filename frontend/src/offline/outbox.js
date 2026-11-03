// De outbox: wijzigingen die offline zijn gedaan en nog naar de server moeten, in de
// volgorde waarin je ze deed. Eén outbox voor de hele app (boodschappenlijst en
// standaardlijst), zodat "eerst toevoegen, dan afstrepen" ook in die volgorde aankomt.
//
// Een actie: { id, type, kind, target, payload, at }.
// - id: een uuid (crypto.randomUUID), ook de client_id of client_action_id voor de server,
//   zodat dubbel versturen niets dubbel doet.
// - type: wat het is ('shopping.check', 'standard.create', …); de store kiest per type het
//   request (zie stores/offline.js).
// - target: het ding waar het over gaat ('shopping:12', 'standard:12', of voor iets dat
//   offline is aangemaakt 'shopping:tmp:<uuid>'), of null.
// - kind: hoe hij samengaat met andere acties voor hetzelfde target:
//   'create'  maakt het target aan (een nieuw standaarditem, een nieuwe losse regel);
//   'call'    de server rekent ("Alles op lijst"); met target als hij één nieuwe regel geeft;
//   'set'     zet een waarde ("afgestreept = true", "aantal = 3"), nooit "draai om";
//   'delete'  haalt het target weg.
//
// Samenvoegen (enqueue):
// - 'set' na een create/call voor hetzelfde target: de waarde gaat in die create (er hoeft
//   maar één request). Anders vervangt hij een eerdere 'set' van hetzelfde type en target:
//   de laatste wint, en die komt achteraan.
// - 'delete' na een create/call voor hetzelfde target: beide vallen weg (offline gemaakt en
//   weer weggehaald: de server hoeft er nooit van te weten). Anders vallen de 'set's voor
//   dat target weg, en komt de delete achteraan.
//
// Versturen (flush): één voor één, in volgorde. 404 = het bestaat niet meer: overslaan.
// 422 (of 400/409) = de server wil het niet: laten vallen, en doorgeven voor één melding.
// Geen netwerk, te veel verzoeken of de server stuk: stoppen; de rest blijft staan.
import { readJson, writeJson } from './storage'

// Fouten (ApiError.kind) waarbij de actie weg mag: het opnieuw proberen geeft hetzelfde.
const DROP_KINDS = ['validation', 'conflict']
const TEMP = ':tmp:'

// Een tijdelijke id voor iets dat offline is aangemaakt ('tmp:<uuid>'), zodat je het kunt
// tonen, afstrepen en weghalen voordat de server het kent.
export function tempId(uuid) {
  return `tmp:${uuid}`
}

export function isTempId(id) {
  return typeof id === 'string' && id.startsWith('tmp:')
}

export function newId() {
  return crypto.randomUUID()
}

export function createOutbox(key = 'outbox') {
  // De actie die nu verstuurd wordt (id): daar voegen we niets meer in samen, want het
  // request is al onderweg met de oude payload.
  let sending = null
  // Een lopende flush(), zodat 'online' en terugkeren naar de app niet dubbel versturen.
  let pendingFlush = null

  // { actions: [...], ids: { target: server-id } }. ids: wat de server teruggaf voor iets
  // dat offline is aangemaakt, voor acties die erna komen ('shopping:tmp:x' → 12).
  function load() {
    const stored = readJson(key)
    return {
      actions: Array.isArray(stored?.actions) ? stored.actions : [],
      ids: stored?.ids && typeof stored.ids === 'object' ? stored.ids : {},
    }
  }

  function save(state) {
    // Leeg: dan zijn ook de tijdelijke ids niet meer nodig.
    writeJson(key, state.actions.length ? state : { actions: [], ids: {} })
  }

  function all() {
    return load().actions
  }

  // Zet een actie erbij (met id en at als die ontbreken) en geeft terug wat er gebeurde:
  // 'added', 'merged' (in een create/call of een eerdere set) of 'cancelled' (een delete
  // die een offline create ongedaan maakte).
  function enqueue(input) {
    const action = { id: newId(), at: new Date().toISOString(), target: null, ...input }
    const state = load()
    const creating = (a) =>
      a.target != null &&
      a.target === action.target &&
      (a.kind === 'create' || a.kind === 'call') &&
      a.id !== sending
    let result = 'added'

    if (action.kind === 'set') {
      const create = state.actions.find(creating)
      if (create) {
        create.payload = { ...create.payload, ...action.payload }
        result = 'merged'
      } else {
        const before = state.actions.length
        state.actions = state.actions.filter(
          (a) => !(a.kind === 'set' && a.type === action.type && a.target === action.target),
        )
        if (state.actions.length < before) result = 'merged'
        state.actions.push(action)
      }
    } else if (action.kind === 'delete') {
      if (state.actions.some(creating)) {
        state.actions = state.actions.filter((a) => a.target !== action.target)
        result = 'cancelled'
      } else {
        state.actions = state.actions.filter(
          (a) => !(a.kind === 'set' && a.target === action.target),
        )
        state.actions.push(action)
      }
    } else {
      state.actions.push(action)
    }
    save(state)
    return result
  }

  // Haalt alle acties weg waarvoor predicate(action) true geeft.
  function discard(predicate) {
    const state = load()
    state.actions = state.actions.filter((a) => !predicate(a))
    save(state)
  }

  // De server-id voor een target, of het id uit het target zelf ('shopping:12' → 12). null
  // voor een offline aangemaakt ding waarvan de create (nog) niet gelukt is.
  function resolve(target, ids = load().ids) {
    if (target == null) return null
    if (target in ids) return ids[target]
    if (target.includes(TEMP)) return null
    const id = Number(target.slice(target.lastIndexOf(':') + 1))
    return Number.isNaN(id) ? null : id
  }

  function finish(action, serverId) {
    const state = load()
    state.actions = state.actions.filter((a) => a.id !== action.id)
    if (serverId != null && action.target?.includes(TEMP)) state.ids[action.target] = serverId
    save(state)
  }

  // Verstuurt de acties één voor één met send(action, { id }) (een belofte). id: de
  // server-id van het target (zie resolve). send mag { id } teruggeven: de server-id van
  // wat hij aanmaakte. Ook acties die tijdens het versturen binnenkomen, gaan mee.
  // Geeft { sent, skipped, dropped: [{ action, error }] } terug; gooit bij een fout die
  // betekent "later opnieuw" (de rest blijft staan).
  function flush(send) {
    if (pendingFlush) return pendingFlush
    pendingFlush = (async () => {
      const result = { sent: 0, skipped: 0, dropped: [] }
      for (;;) {
        const { actions, ids } = load()
        const action = actions[0]
        if (!action) break
        const id = resolve(action.target, ids)
        // Een actie op iets waarvan de create wegviel (422): dat bestaat niet.
        if (
          action.target?.includes(TEMP) &&
          action.kind !== 'create' &&
          action.kind !== 'call' &&
          id == null
        ) {
          finish(action)
          result.skipped++
          continue
        }
        sending = action.id
        let created = null
        try {
          created = await send(action, { id })
          result.sent++
        } catch (e) {
          if (e?.kind === 'not_found') {
            result.skipped++
          } else if (DROP_KINDS.includes(e?.kind)) {
            result.dropped.push({ action, error: e })
          } else {
            throw e
          }
        } finally {
          sending = null
        }
        finish(action, created?.id ?? null)
      }
      return result
    })().finally(() => (pendingFlush = null))
    return pendingFlush
  }

  return {
    all,
    enqueue,
    discard,
    resolve,
    flush,
    get size() {
      return all().length
    },
  }
}
