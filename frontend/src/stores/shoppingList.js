import { defineStore } from 'pinia'
import * as api from '@/api/shoppingList'
import { ApiError } from '@/api/client'
import { addRecipeToShoppingList } from '@/api/recipes'
import { addStandardItemsToShoppingList } from '@/api/standardItems'
import { addVariationToShoppingList } from '@/api/variations'
import { recipesOnList } from '@/utils/shoppingListRecipes'
import { createActionQueue, isNetworkError, isOffline, loadSnapshot, saveSnapshot } from '@/offline'

// De boodschappenlijst staat op de server: één gedeelde lijst voor iedereen met de link,
// op elk apparaat dezelfde. Regels worden nooit samengevoegd: twee keer bloem (uit twee
// recepten) zijn twee regels, elk met eigen herkomst. Behalve vanaf de standaardlijst:
// staat melk er al op, dan telt de server één op bij standard_count van een bestaande
// regel ("melk ×2", "melk 200 ml +1"; zie src/utils/shoppingListLine.js).
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

// Namen vergelijken zoals de opdracht zegt: spaties eromheen weg, kleine letters, verder exact.
export function normalizeName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
}

// Hetzelfde ingrediënt? Op ingredient_id als beide er een hebben; anders (een vrije regel
// van de standaardlijst, of een toevoeging van een variatie) op naam.
function sameIngredient(item, ingredient) {
  if (item.ingredient_id != null && ingredient.ingredient_id != null) {
    return item.ingredient_id === ingredient.ingredient_id
  }
  return normalizeName(item.name) === normalizeName(ingredient.name)
}

// Waar een regel vandaan komt, klein onder "✓ op lijst": "standaard", een (ander)
// recept, of "lijst" (zelf getypt op de boodschappenlijst).
function sourceOf(item) {
  return item.source_label ?? 'lijst'
}

// Een lopende load(), zodat App en de pagina die tegelijk aanroepen maar één request doen.
let pendingLoad = null

export const useShoppingListStore = defineStore('shoppingList', {
  state: () => ({
    // Zoals de server ze stuurt: { id, name, quantity, unit, source_label, recipe_id,
    // ingredient_id, checked, standard_count }.
    items: [],
    loaded: false,
    // Telt elke lokale wijziging, en hoeveel daarvan nog onderweg zijn. Zie load().
    changes: 0,
    inFlight: 0,
    // true als de browser geen netwerk meldt of de server niet te bereiken was.
    offline: false,
    // Wanneer de getoonde lijst voor het laatst van de server kwam (ms), of null.
    savedAt: null,
    // true zodra de lijst in deze sessie vers van de server kwam; tot dan (en weer na
    // verbindingsverlies) is wat je ziet de offline kopie van savedAt.
    fresh: false,
    // Hoeveel offline wijzigingen nog in de wachtrij staan (een kopie van queue.size:
    // localStorage zelf is niet reactief).
    pending: queue.size,
  }),

  getters: {
    openCount: (state) => state.items.filter((item) => !item.checked).length,
    hasChecked: (state) => state.items.some((item) => item.checked),
    // "Recepten op je lijst": zie src/utils/shoppingListRecipes.js.
    recipesOnList: (state) => recipesOnList(state.items),

    // Staat dit ingrediënt ({ ingredient_id, name }) op de lijst, gezien vanaf het recept
    // recipeId? Alleen open (niet afgestreepte) regels tellen, van welke herkomst ook.
    //   onList: minstens één open regel
    //   own:    de open regels met dit recept als herkomst (die haalt "✓ op lijst" weg)
    //   via:    zonder eigen regels de herkomst van de eerste andere ("standaardlijst",
    //           "Wok met kip"), anders null
    // Afgeleid uit items, dus na toevoegen, verwijderen, afvinken of verversen klopt het meteen.
    listStatus: (state) => (ingredient, recipeId) => {
      const open = state.items.filter((item) => !item.checked && sameIngredient(item, ingredient))
      const own = open.filter((item) => item.recipe_id === recipeId)
      return {
        onList: open.length > 0,
        own,
        via: own.length === 0 && open.length > 0 ? sourceOf(open[0]) : null,
      }
    },
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
        this.markOffline()
        if (this.loaded) return Promise.resolve()
        return Promise.reject(new ApiError('network', 'Geen internetverbinding.'))
      }
      const changesBefore = this.changes
      pendingLoad = this.sync()
        .then(() => api.fetchShoppingList())
        .then((items) => {
          this.offline = false
          this.fresh = true
          if (this.changes === changesBefore && this.inFlight === 0) {
            this.items = withQueuedActions(items)
          }
          this.loaded = true
          this.persist()
        })
        .catch((e) => {
          if (!isNetworkError(e)) throw e
          this.markOffline()
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
      } finally {
        this.pending = queue.size
      }
    },

    // De browser meldt dat de verbinding weg is ('offline'-event).
    markOffline() {
      this.offline = true
      this.fresh = false
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

    // Nieuwe of gewijzigde regels van de server: een bekende regel vervangen, een nieuwe
    // achteraan. item null: regel id is weg.
    putLine(id, item) {
      if (item == null) {
        this.items = this.items.filter((i) => i.id !== id)
      } else if (this.items.some((i) => i.id === item.id)) {
        this.items = this.items.map((i) => (i.id === item.id ? item : i))
      } else {
        this.items.push(item)
      }
    },

    // De standaardlijst ([+] of "Op lijst (n)"): de server telt één op bij een regel die er
    // al open op staat, of maakt een nieuwe (zie ShoppingListItem.add_standard!).
    async addStandardItems(ids) {
      this.changes++
      const lines = await addStandardItemsToShoppingList(ids)
      for (const line of lines) this.putLine(line.id, line)
      this.persist()
      return lines
    },

    // De −-knop op de boodschappenlijst: één minder van de standaardlijst. Een regel die
    // alleen van de standaardlijst kwam, verdwijnt op 0; een receptregel houdt zijn deel.
    // Is de regel al weg (404), dan hier ook, en gooien we de fout door voor de melding.
    async removeStandard(id) {
      this.changes++
      try {
        const { item } = await api.removeStandardFromShoppingListItem(id)
        this.putLine(id, item)
      } catch (e) {
        if (e.kind === 'not_found') this.putLine(id, null)
        throw e
      } finally {
        this.persist()
      }
    },

    // Voegt regels toe zoals ze zijn, zonder rekenwerk, in één request.
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
    // als bij een variatie, en geeft de nieuwe regels terug (die geven we ook terug).
    // skipIds: regels die in huis zijn; die slaat "Alles op lijst" over.
    async addRecipe(recipeId, servings, ingredientIds = null, alternativeIds = [], skipIds = []) {
      this.changes++
      const lines = await addRecipeToShoppingList(
        recipeId,
        servings,
        ingredientIds,
        alternativeIds,
        skipIds,
      )
      this.items.push(...lines)
      this.persist()
      return lines
    },

    // "Ontbrekende op lijst" (op "In huis" en bij "Met ingrediënt…"): de regels die nog
    // ontbreken (missing: [{ id: regel-id, name }]), het origineel en geen alternatief, met
    // de porties van het recept zelf.
    addMissing(recipe, missing) {
      return this.addRecipe(
        recipe.id,
        recipe.servings,
        missing.map((row) => row.id),
      )
    },

    // "Variatie op lijst": de server stelt de regels samen en geeft ze terug (wij ook).
    // skip: wat in huis is, zie addVariationToShoppingList.
    async addVariation(recipeId, variationId, servings, alternativeIds = [], skip = {}) {
      this.changes++
      const lines = await addVariationToShoppingList(
        recipeId,
        variationId,
        servings,
        alternativeIds,
        skip,
      )
      this.items.push(...lines)
      this.persist()
      return lines
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
        this.markOffline()
        queue.enqueue(action)
        this.pending = queue.size
        return
      }
      // Een oudere offline actie voor deze regel mag deze waarde later niet overschrijven.
      queue.discard(id)
      this.pending = queue.size
      this.inFlight++
      try {
        await api.updateShoppingListItem(id, { checked })
        this.persist()
        // De server is weer bereikbaar: verstuur wat er nog wachtte en ververs.
        if (this.offline || queue.size > 0) this.load().catch(() => {})
      } catch (e) {
        if (isNetworkError(e)) {
          this.markOffline()
          queue.enqueue(action)
          this.pending = queue.size
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

    // "✓ op lijst" op de receptpagina: haalt het receptdeel weg van alle open regels van dit
    // ingrediënt met dit recept als herkomst. Regels uit een andere herkomst blijven staan.
    // Was zo'n regel ook van de standaardlijst bijgeteld (standard_count > 0), dan blijft
    // hij staan als standaardregel ("melk"); anders verdwijnt hij.
    async removeFromRecipe(ingredient, recipeId) {
      const ids = this.listStatus(ingredient, recipeId).own.map((item) => item.id)
      this.changes++
      await Promise.all(
        ids.map(async (id) => {
          try {
            const { item } = await api.removeRecipeFromShoppingListItem(id)
            this.putLine(id, item)
          } catch (e) {
            // Al door iemand anders verwijderd: weg is weg.
            if (e.kind !== 'not_found') throw e
            this.putLine(id, null)
          }
        }),
      )
      this.persist()
    },

    // "Verwijder" in "Recepten op je lijst" (recipe: een rij van recipesOnList): alle open
    // regels van dat recept in één request. Wat ook van de standaardlijst kwam, blijft als
    // standaardregel, net als bij "✓ op lijst" (ShoppingListItem#remove_recipe_part!).
    // De receptpagina en de standaardlijst lezen uit items, dus die kloppen meteen.
    async removeRecipe(recipe) {
      this.changes++
      const { removed_ids: removedIds, items } = await api.removeRecipeFromShoppingList(recipe)
      for (const id of removedIds) this.putLine(id, null)
      for (const item of items) this.putLine(item.id, item)
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
