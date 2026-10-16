import { defineStore } from 'pinia'
import * as api from '@/api/shoppingList'
import { ApiError } from '@/api/client'
import { addRecipeToShoppingList } from '@/api/recipes'
import { addVariationToShoppingList } from '@/api/variations'
import {
  createActionQueue,
  isNetworkError,
  isOffline,
  loadSnapshot,
  saveSnapshot,
} from '@/offline'

// De boodschappenlijst staat op de server: één gedeelde lijst voor iedereen met de link,
// op elk apparaat dezelfde. Regels worden nooit samengevoegd: twee keer bloem (uit twee
// recepten) zijn twee regels, elk met eigen herkomst.
//
// Offline (in de winkel zonder bereik): de store bewaart na elk contact met de server een
// kopie in localStorage (snapshot) en toont die bij openen meteen. Afvinken werkt dan nog;
// dat gaat in een wachtrij en wordt verstuurd zodra er weer verbinding is. Toevoegen,
// verwijderen en wissen kan offline niet. Zie src/offline/.

const OFFLINE_KEY = 'shoppingList'

// Acties: { item_id, checked, at }. Per regel telt alleen de laatste.
const queue = createActionQueue(OFFLINE_KEY, { idOf: (action) => action.item_id })

function sendAction(action) {
  return api.updateShoppingListItem(action.item_id, { checked: action.checked })
}

// Wat nog in de wachtrij staat, over de (oudere) stand van de server heen.
function withQueuedActions(items) {
  const actions = queue.all()
  if (actions.length === 0) return items
  const checkedById = new Map(actions.map((a) => [a.item_id, a.checked]))
  return items.map((item) =>
    checkedById.has(item.id) ? { ...item, checked: checkedById.get(item.id) } : item,
  )
}

// Een lopende load(), zodat App en de pagina die tegelijk aanroepen maar één request doen.
let pendingLoad = null

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    // Zoals de server ze stuurt: { id, name, quantity, unit, source_label, recipe_id, checked }.
    items: [],
    loaded: false,
    // Telt elke lokale wijziging, en hoeveel daarvan nog onderweg zijn. Zie load().
    changes: 0,
    inFlight: 0,
    // true als de browser geen netwerk meldt of de server niet te bereiken was.
    offline: false,
    // Wanneer de getoonde lijst voor het laatst van de server kwam (ms), of null.
    savedAt: null,
  }),

  getters: {
    openCount: (state) => state.items.filter((item) => !item.checked).length,
    hasChecked: (state) => state.items.some((item) => item.checked),
  },

  actions: {
    // Haalt de hele lijst op. De eerste keer staat de opgeslagen kopie er meteen (al
    // vóór het request), zodat je niet op het netwerk hoeft te wachten. Eerst gaan de
    // offline afgevinkte regels naar de server, daarna halen we de lijst op.
    //
    // Is er intussen hier iets afgevinkt (of is dat nog onderweg), dan kan het antwoord
    // ouder zijn dan wat je ziet; dan houden we de eigen stand en haalt de volgende
    // verversing de rest op. Zonder verbinding blijft de kopie staan (offline wordt true);
    // alleen als er geen kopie is, gooien we de fout door. Andere fouten (ApiError) ook.
    load() {
      if (pendingLoad) return pendingLoad
      if (!this.loaded) this.restoreSnapshot()
      if (isOffline()) {
        this.offline = true
        if (this.loaded) return Promise.resolve()
        return Promise.reject(new ApiError('network', 'Geen internetverbinding.'))
      }
      const changesBefore = this.changes
      pendingLoad = this.sync()
        .then(() => api.fetchShoppingList())
        .then((items) => {
          this.offline = false
          if (this.changes === changesBefore && this.inFlight === 0) {
            this.items = withQueuedActions(items)
          }
          this.loaded = true
          this.persist()
        })
        .catch((e) => {
          if (!isNetworkError(e)) throw e
          this.offline = true
          if (!this.loaded) throw e
        })
        .finally(() => (pendingLoad = null))
      return pendingLoad
    },

    // Verstuurt de offline wachtrij. Zonder verbinding gooit hij de fout door (de rest
    // blijft staan); lukt het om een andere reden niet (server stuk), dan blijft de rest
    // ook staan en proberen we het bij de volgende verversing opnieuw.
    async sync() {
      try {
        await queue.flush(sendAction)
      } catch (e) {
        if (isNetworkError(e)) throw e
      }
    },

    // De browser meldt dat de verbinding weg is ('offline'-event).
    markOffline() {
      this.offline = true
    },

    restoreSnapshot() {
      const snapshot = loadSnapshot(OFFLINE_KEY)
      if (!snapshot || !Array.isArray(snapshot.data)) return
      this.items = withQueuedActions(snapshot.data)
      this.savedAt = snapshot.savedAt
      this.loaded = true
    },

    // Na elk geslaagd contact met de server: de lijst zoals je hem nu ziet, met tijdstip.
    persist() {
      this.savedAt = Date.now()
      saveSnapshot(OFFLINE_KEY, this.items, this.savedAt)
    },

    // Voegt regels toe zoals ze zijn, zonder rekenwerk, in één request (de standaardlijst).
    // Elk ingrediënt wordt een nieuwe regel achteraan, ook als dezelfde naam er al staat.
    // ingredients: [{ name, quantity, unit }], source: { label, recipeId }.
    // "Naar smaak" (quantity null) gaat zonder eenheid.
    async addIngredients(ingredients, { label = null, recipeId = null } = {}) {
      if (ingredients.length === 0) return
      const payload = ingredients.map(({ name, quantity, unit }) => ({
        name,
        quantity: quantity ?? null,
        unit: quantity == null ? null : unit,
        source_label: label,
        recipe_id: recipeId,
      }))
      this.changes++
      this.items.push(...(await api.addShoppingListItems(payload)))
      this.persist()
    },

    // "Alles op lijst" (ingredientIds null: alles behalve de optionele) of "+ lijst" (één
    // id) op de receptpagina. De server schaalt en rondt af (app/models/quantity.rb), net
    // als bij een variatie, en geeft de nieuwe regels terug.
    async addRecipe(recipeId, servings, ingredientIds = null) {
      this.changes++
      this.items.push(...(await addRecipeToShoppingList(recipeId, servings, ingredientIds)))
      this.persist()
    },

    // "Variatie op lijst": de server stelt de regels samen en geeft ze terug.
    async addVariation(recipeId, variationId, servings) {
      this.changes++
      this.items.push(...(await addVariationToShoppingList(recipeId, variationId, servings)))
      this.persist()
    },

    // Optimistisch: het vinkje staat er meteen, het request volgt. Naar de server gaat de
    // nieuwe waarde (checked: true of false), nooit "draai om".
    // Zonder verbinding gaat die waarde in de wachtrij en blijft het vinkje gewoon staan.
    // Weigert de server, dan draaien we het terug en gooien we de fout door, zodat de
    // pagina een melding toont. Heeft iemand anders de regel al verwijderd, dan
    // verdwijnt hij hier ook.
    async toggle(id) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      const checked = !item.checked
      item.checked = checked
      this.changes++
      const action = { item_id: id, checked, at: new Date().toISOString() }
      if (isOffline()) {
        this.offline = true
        queue.enqueue(action)
        return
      }
      // Een oudere offline actie voor deze regel mag deze waarde later niet overschrijven.
      queue.discard(id)
      this.inFlight++
      try {
        await api.updateShoppingListItem(id, { checked })
        this.persist()
        // De server is weer bereikbaar: verstuur wat er nog wachtte en ververs.
        if (this.offline || queue.size > 0) this.load().catch(() => {})
      } catch (e) {
        if (isNetworkError(e)) {
          this.offline = true
          queue.enqueue(action)
          return
        }
        if (e.kind === 'not_found') {
          this.items = this.items.filter((i) => i.id !== id)
        } else if (item.checked === checked) {
          item.checked = !checked
        }
        throw e
      } finally {
        this.inFlight--
      }
    },

    // Al door iemand anders verwijderd (404) is ook goed: weg is weg.
    async remove(id) {
      this.changes++
      try {
        await api.deleteShoppingListItem(id)
      } catch (e) {
        if (e.kind !== 'not_found') throw e
      }
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
    },

    async clearChecked() {
      this.changes++
      await api.clearCheckedShoppingListItems()
      this.items = this.items.filter((i) => !i.checked)
      this.persist()
    },

    async clearAll() {
      this.changes++
      await api.clearAllShoppingListItems()
      this.items = []
      this.persist()
    },
  },
})
