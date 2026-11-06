import { defineStore } from 'pinia'
import * as api from '@/api/standardItems'
import { ApiError } from '@/api/client'
import { isNetworkError, isOffline, isTempId, newId, tempId } from '@/offline'
import { useOfflineStore } from '@/stores/offline'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useSnapshotStore } from '@/stores/snapshot'
import { byName, groupByCategory } from '@/utils/grouping'
import { TEMPORARY_NAME, isExpired, isTemporary } from '@/utils/temporaryItems'

// De vaste boodschappen, via de openbare API: iedereen met de link ziet en wijzigt
// dezelfde lijst. Fouten (ApiError) gooien we door, zodat de pagina de melding kan tonen.
//
// Offline: de lijst komt uit de offline snapshot (stores/snapshot.js). Toevoegen, bewerken
// en verwijderen gaan dan in de outbox (stores/offline.js) en staan er alvast; een nieuw
// item heeft tot de sync een tijdelijk id en pending: true ("wacht op sync").

// Zoals StandardItem op de server: spaties weg, kleine letters, maximaal MAX_LENGTH.
const MAX_LENGTH = 100
function withoutExpired(items) {
  const now = Date.now()
  return items.filter((item) => !isExpired(item, now))
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function target(id) {
  return `standard:${id}`
}

// Een bewerking zoals de server hem bewaart: een categorie of temporary: false maakt een
// tijdelijk item permanent.
function updated(item, { name, category, temporary }) {
  const permanent = category != null || temporary === false
  return {
    ...item,
    name,
    category,
    temporary_last_used_at: permanent ? null : (item.temporary_last_used_at ?? null),
  }
}

// De outbox-acties voor de standaardlijst over items heen (de stand van de server).
function withQueuedActions(items) {
  let result = items
  for (const action of useOfflineStore().queued) {
    if (!action.type.startsWith('standard.')) continue
    const id = action.target.slice('standard:'.length)
    const itemId = /^\d+$/.test(id) ? Number(id) : id
    if (action.type === 'standard.create') {
      result = [...result, { id: itemId, ...action.payload, pending: true }]
    } else if (action.type === 'standard.update') {
      result = result.map((item) => (item.id === itemId ? updated(item, action.payload) : item))
    } else if (action.type === 'standard.delete') {
      result = result.filter((item) => item.id !== itemId)
    }
  }
  return result
}

// Een lopende load(), zodat App (bij de overgang naar online) en de pagina die tegelijk
// aanroepen maar één request doen.
let pendingLoad = null

export const useStandardItemsStore = defineStore('standardItems', {
  state: () => ({
    items: [],
    loaded: false,
    // true als wat je ziet de offline kopie is (geen verbinding).
    offline: false,
    // "Mogelijk hetzelfde": [{ standard_item, candidates: [{ id, name }] }], van de server
    // (loadSuggestions). Offline niet opgehaald: koppelen kan alleen online.
    suggestions: [],
  }),

  getters: {
    // Per categorie op alfabet, "overig" (null) daarna en "Tijdelijk" altijd als laatste
    // (temporary: true); binnen een groep op naam.
    groups: (state) => {
      const sorted = state.items.toSorted(byName)
      const groups = groupByCategory(
        sorted.filter((item) => !isTemporary(item)),
        (item) => item.category,
      )
      const temporary = sorted.filter(isTemporary)
      if (temporary.length) groups.push({ category: null, temporary: true, items: temporary })
      return groups
    },

    // Voor de keuzelijst in het formulier: elke categorie één keer, op alfabet.
    categories: (state) =>
      [
        ...new Set(
          state.items
            .filter((item) => !isTemporary(item))
            .map((item) => item.category)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'nl')),
  },

  actions: {
    // Eerst de kopie uit de snapshot (meteen te zien), dan de outbox versturen en vers
    // ophalen. Zonder verbinding blijft de kopie staan; zonder kopie gooien we de fout door.
    // Zolang de server niet online is en er een kopie is: geen request (ook de outbox nog
    // niet); bij de overgang naar online ververst App.vue.
    load() {
      pendingLoad ??= this.fetchFresh().finally(() => (pendingLoad = null))
      return pendingLoad
    },

    async fetchFresh() {
      const snapshot = useSnapshotStore()
      snapshot.restore()
      if (!this.loaded && snapshot.data?.standard_items) {
        this.items = withQueuedActions(withoutExpired(snapshot.data.standard_items))
        this.loaded = true
      }
      if (isOffline()) {
        this.offline = true
        if (this.loaded) return
        throw new ApiError('network', 'Geen internetverbinding.')
      }
      if (!useServerStatusStore().online && this.loaded) {
        this.offline = true
        return
      }
      try {
        await useOfflineStore().sync()
        const items = await api.fetchStandardItems()
        this.items = withQueuedActions(withoutExpired(items))
        this.loaded = true
        this.offline = false
        snapshot.patch('standard_items', items)
      } catch (e) {
        if (!isNetworkError(e) || !this.loaded) throw e
        this.offline = true
      }
    },

    // Zolang de server niet online is, of voor een item dat zelf nog op sync wacht: meteen
    // via de outbox, zonder request.
    queues(id = null) {
      return !useServerStatusStore().online || (id != null && isTempId(id))
    },

    enqueue(action) {
      this.offline = true
      useOfflineStore().enqueue(action)
    },

    // Wat de server zou weigeren, offline alvast hier: een lege, te lange of dubbele naam.
    // Gooit een ApiError zoals de server die zou geven (errors.name), voor het formulier.
    checkOffline(fields, id = null) {
      const name = normalize(fields.name)
      let message = null
      if (!name) message = 'moet opgegeven zijn'
      else if (name.length > MAX_LENGTH) message = `is te lang (maximaal ${MAX_LENGTH} tekens)`
      else if (this.items.some((item) => item.id !== id && item.name === name)) {
        message = 'is al in gebruik'
      }
      const category = normalize(fields.category) || null
      const errors = {}
      if (message) errors.name = [message]
      if (category === TEMPORARY_NAME.toLowerCase()) {
        errors.category = [`kan niet "${TEMPORARY_NAME}" zijn, die naam is gereserveerd`]
      }
      if (Object.keys(errors).length) {
        throw new ApiError('validation', 'Controleer de ingevulde velden.', {
          status: 422,
          errors,
        })
      }
      return { name, category }
    },

    // fields: { name, category }. De server normaliseert en geeft het nette item terug.
    // Met client_id: valt de verbinding onderweg weg, dan gaat hetzelfde item via de
    // outbox, en de server maakt het niet twee keer.
    async add(fields) {
      const clientId = newId()
      const queue = () => {
        const item = { id: tempId(clientId), ...this.checkOffline(fields), pending: true }
        this.enqueue({
          id: clientId,
          type: 'standard.create',
          kind: 'create',
          target: target(item.id),
          payload: { name: item.name, category: item.category },
        })
        this.items.push(item)
        return item
      }
      if (this.queues()) return queue()
      try {
        const item = await api.createStandardItem({ ...fields, client_id: clientId })
        this.items.push(item)
        return item
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return queue()
      }
    },

    // fields: { name, category, temporary? }; temporary: false maakt een tijdelijk item
    // permanent zonder categorie ("Geen categorie" in het formulier).
    async update(id, fields) {
      const queue = () => {
        const current = this.items.find((i) => i.id === id)
        const payload = { ...this.checkOffline(fields, id) }
        if (fields.temporary === false) payload.temporary = false
        const item = updated(current, payload)
        this.enqueue({ type: 'standard.update', kind: 'set', target: target(id), payload })
        this.items = this.items.map((i) => (i.id === id ? item : i))
        return item
      }
      if (this.queues(id)) return queue()
      try {
        const item = await api.updateStandardItem(id, fields)
        this.items = this.items.map((i) => (i.id === id ? item : i))
        return item
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return queue()
      }
    },

    async remove(id) {
      const queue = () => {
        this.enqueue({ type: 'standard.delete', kind: 'delete', target: target(id) })
        this.items = this.items.filter((i) => i.id !== id)
      }
      if (this.queues(id)) return queue()
      try {
        await api.deleteStandardItem(id)
        this.items = this.items.filter((i) => i.id !== id)
      } catch (e) {
        if (!isNetworkError(e)) throw e
        queue()
      }
    },

    // Geeft het aantal verwijderde items terug. Offline elk item apart in de outbox.
    async removeMany(ids) {
      if (this.queues() || ids.some(isTempId)) {
        for (const id of ids) await this.remove(id)
        return ids.length
      }
      const { deleted_ids: deleted } = await api.bulkDeleteStandardItems(ids)
      this.items = this.items.filter((i) => !deleted.includes(i.id))
      return deleted.length
    },

    // ---------- Koppelen aan een ingrediënt ("uien" is "ui") ----------
    // Alleen online: de server zet ook de open regels op de boodschappenlijst om. Offline
    // gooit het request een netwerkfout, die de pagina toont (de knoppen staan dan uit).

    // Mislukt dit, dan is er gewoon geen blok "Mogelijk hetzelfde".
    async loadSuggestions() {
      if (!useServerStatusStore().online) return
      try {
        this.suggestions = await api.fetchLinkSuggestions()
      } catch {
        this.suggestions = []
      }
    },

    // Het item zoals de server het nu heeft, ook in de offline kopie: zo werkt het huisje
    // offline met de koppeling.
    putItem(item) {
      this.items = this.items.map((i) => (i.id === item.id ? { ...i, ...item } : i))
      useSnapshotStore().patch(
        'standard_items',
        this.items.filter((i) => !i.pending),
      )
    },

    // "Ja, hetzelfde". De boodschappenlijst opnieuw ophalen: daar kregen open regels met
    // deze naam het ingrediënt.
    async link(id, ingredientId) {
      const item = await api.linkStandardItem(id, ingredientId)
      this.putItem(item)
      this.suggestions = this.suggestions.filter((s) => s.standard_item.id !== id)
      useShoppingListStore()
        .load()
        .catch(() => {})
      return item
    },

    // Ontkoppeld kan het item weer een suggestie zijn.
    async unlink(id) {
      const item = await api.unlinkStandardItem(id)
      this.putItem(item)
      await this.loadSuggestions()
      return item
    },

    // "Nee": dat ene paar weg; zonder kandidaten het hele item.
    async rejectLink(id, ingredientId) {
      await api.rejectStandardItemLink(id, ingredientId)
      this.suggestions = this.suggestions
        .map((s) =>
          s.standard_item.id === id
            ? { ...s, candidates: s.candidates.filter((c) => c.id !== ingredientId) }
            : s,
        )
        .filter((s) => s.candidates.length > 0)
    },

    // Op de gedeelde boodschappenlijst, in één request, zonder hoeveelheid: je moet het
    // gewoon kopen. Staat het er al (open) op, dan komt er één bij op het aantal van die regel;
    // anders een nieuwe regel met herkomst "standaard". Geeft het aantal items terug.
    async addToShoppingList(ids) {
      const chosen = this.items.filter((i) => ids.includes(i.id))
      if (chosen.length === 0) return 0
      await useShoppingListStore().addStandardItems(chosen)
      return chosen.length
    },
  },
})
