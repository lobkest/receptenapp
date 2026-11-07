import { defineStore } from 'pinia'
import * as api from '@/api/shoppingList'
import { ApiError } from '@/api/client'
import { addRecipeToShoppingList } from '@/api/recipes'
import {
  addStandardItemsToShoppingList,
  removeStandardNamesFromShoppingList,
} from '@/api/standardItems'
import { addVariationToShoppingList } from '@/api/variations'
import { recipesOnList } from '@/utils/shoppingListRecipes'
import { isNetworkError, isOffline, isTempId, loadSnapshot, newId, saveSnapshot } from '@/offline'
import { useOfflineStore } from '@/stores/offline'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useSnapshotStore } from '@/stores/snapshot'
import {
  applyShoppingAction,
  applyShoppingActions,
  lineTarget,
  looseMatch,
  recipeLines,
  variationLines,
} from '@/utils/offlineShoppingList'
import { isStandardOnly, MAX_COUNT } from '@/utils/shoppingListLine'

// De boodschappenlijst staat op de server: één gedeelde lijst voor iedereen met de link,
// op elk apparaat dezelfde. Regels worden nooit samengevoegd: twee keer bloem (uit twee
// recepten) zijn twee regels, elk met eigen herkomst. Behalve vanaf de standaardlijst:
// staat melk er al op, dan telt de server één op bij het aantal (count) van een bestaande
// regel. Het aantal zet je ook zelf met de stepper (setCount); zie
// src/utils/shoppingListLine.js voor hoe een regel het toont.
//
// Offline (in de winkel zonder bereik, of zolang de server nog niet online is, zie
// stores/serverStatus.js): de store bewaart na elk contact met de server een
// kopie (snapshot, in IndexedDB) en toont die bij openen meteen. Afstrepen, het aantal
// veranderen, regels verwijderen en toevoegen (vanuit een recept, de standaardlijst of los)
// werken dan nog: dat gaat in de outbox (stores/offline.js) en wordt verstuurd zodra er
// weer verbinding is. Tot dan staat het er alvast, als "wacht op sync" (zie
// src/utils/offlineShoppingList.js). Wissen en "✓ op lijst" weghalen kan offline niet.
// Ook online krijgt elke toevoeging een uuid mee: valt de verbinding weg terwijl het request
// onderweg is, dan gaat dezelfde actie via de outbox, en de server zet niets dubbel.

const OFFLINE_KEY = 'shoppingList'

// De categorie van een standaarditem (uit de offline snapshot), voor een regel die alleen
// hier bestaat: dan staat hij offline al in de goede afdeling.
function categoryOf(name) {
  const items = useSnapshotStore().data?.standard_items ?? []
  return items.find((item) => item.name === name)?.category ?? null
}

// Wat nog in de outbox staat, over de (oudere) stand van de server heen.
function withQueuedActions(items) {
  return applyShoppingActions(items, useOfflineStore().queued, { categoryOf })
}

// De stepper: zo lang na de laatste tik wachten we met het request, zodat vijf keer snel
// op + één PATCH wordt in plaats van vijf.
export const COUNT_DELAY = 400

// Per regel een aantal dat nog verstuurd moet worden: { timer, before, resolve }. before:
// het aantal vóór de eerste tik, waar we naar teruggaan als opslaan mislukt. resolve: van
// de belofte van de laatste tik; een nieuwe tik maakt de vorige belofte af.
const pendingCounts = new Map()

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
    // ingredient_id, checked, count, standard_count }.
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

    // De open regels van dit standaarditem ({ ingredient_id, name }) met een deel van de
    // standaardlijst: alleen van de standaardlijst, of met standard_count > 0. Die haalt
    // "✓ op lijst" op de standaardlijst weg (removeStandardItems).
    standardLines: (state) => (ingredient) =>
      state.items.filter(
        (item) =>
          !item.checked &&
          sameIngredient(item, ingredient) &&
          (isStandardOnly(item) || item.standard_count > 0),
      ),
  },

  actions: {
    // Haalt de hele lijst op. De eerste keer staat de opgeslagen kopie er meteen (al
    // vóór het request), zodat je niet op het netwerk hoeft te wachten. Eerst gaan de
    // offline wijzigingen (de outbox) naar de server, daarna halen we de lijst op.
    //
    // Is er intussen hier iets afgevinkt (of is dat nog onderweg), dan kan het antwoord
    // ouder zijn dan wat je ziet; dan houden we de eigen stand en haalt de volgende
    // verversing de rest op. Zonder verbinding blijft de kopie staan (offline wordt true);
    // alleen als er geen kopie is, gooien we de fout door. Andere fouten (ApiError) ook.
    // Zolang de server niet online is (hij wordt wakker, of /up hangt) en er een kopie is:
    // geen request, ook de outbox nog niet. Bij de overgang naar online ververst App.vue.
    load() {
      if (pendingLoad) return pendingLoad
      if (!this.loaded) this.restoreSnapshot()
      if (isOffline()) {
        this.markOffline()
        if (this.loaded) return Promise.resolve()
        return Promise.reject(new ApiError('network', 'Geen internetverbinding.'))
      }
      if (!useServerStatusStore().online && this.loaded) {
        this.markOffline()
        return Promise.resolve()
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
          this.persist(items)
        })
        .catch((e) => {
          if (!isNetworkError(e)) throw e
          this.markOffline()
          if (!this.loaded) throw e
        })
        .finally(() => (pendingLoad = null))
      return pendingLoad
    },

    // Verstuurt de outbox (ook de standaardlijst: alles in de volgorde waarin je het deed).
    // Zonder verbinding gooit hij de fout door; zie stores/offline.js.
    sync() {
      return useOfflineStore().sync()
    },

    // Zolang de server niet online is (geen verbinding, of hij wordt nog wakker), of voor een
    // regel die alleen hier bestaat: dan gaat een wijziging meteen in de outbox, zonder
    // request (dat zou blijven hangen tot de time-out). App.vue verstuurt hem bij online.
    queues(id = null) {
      return !useServerStatusStore().online || (id != null && isTempId(id))
    },

    // Een actie in de outbox en meteen zichtbaar. De regels staan er al (optimistisch); de
    // kopie in de opslag blijft de stand van de server (de outbox komt er bij openen overheen).
    enqueue(action) {
      this.markOffline()
      this.changes++
      const queued = { id: newId(), at: new Date().toISOString(), ...action }
      useOfflineStore().enqueue(queued)
      return queued
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
    // Staan er nog offline wijzigingen in de outbox, dan alleen de stand van de server
    // (serverItems, als die er is): de outbox komt er bij openen weer overheen, en anders
    // zou hij twee keer meetellen.
    persist(serverItems = null) {
      if (serverItems == null && useOfflineStore().has('shopping.')) return
      this.savedAt = Date.now()
      saveSnapshot(OFFLINE_KEY, serverItems ?? this.items, this.savedAt)
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

    // De standaardlijst ([+] of "Op lijst (n)"; "✓ op lijst" alleen als er nog niets van de
    // standaardlijst bij zit, zie removeStandardItems): de server telt één op bij een regel die er
    // al open op staat, of maakt een nieuwe (zie ShoppingListItem.add_standard!).
    // items: [{ id, name }] van de standaardlijst. Offline, of voor een item dat zelf nog
    // op sync wacht (geen id), gaat het op naam via de outbox.
    async addStandardItems(items) {
      if (this.queues() || items.some((item) => isTempId(item.id))) {
        return this.queueAction({
          type: 'shopping.addStandard',
          kind: 'call',
          payload: { names: items.map((item) => item.name).sort() },
        })
      }
      this.changes++
      try {
        const lines = await addStandardItemsToShoppingList(items.map((item) => item.id))
        for (const line of lines) this.putLine(line.id, line)
        this.persist()
        return lines
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return this.queueAction({
          type: 'shopping.addStandard',
          kind: 'call',
          payload: { names: items.map((item) => item.name).sort() },
        })
      }
    },

    // "✓ op lijst" op de standaardlijst: het deel van de standaardlijst eraf
    // (ShoppingListItem.remove_standard!). Regels van een recept of los blijven staan.
    // items: [{ name }] van de standaardlijst. Offline via de outbox, net als toevoegen; ook
    // als er nog een [+] van offline in de outbox wacht, anders kwam die er na het weghalen
    // weer bij.
    async removeStandardItems(items) {
      const action = {
        type: 'shopping.removeStandard',
        kind: 'call',
        payload: { names: items.map((item) => item.name).sort() },
      }
      if (this.queues() || useOfflineStore().has('shopping.addStandard')) {
        return this.queueAction(action)
      }
      this.changes++
      try {
        const { removed_ids: removedIds, items: kept } = await removeStandardNamesFromShoppingList(
          action.payload.names,
        )
        for (const id of removedIds) this.putLine(id, null)
        for (const line of kept) this.putLine(line.id, line)
        this.persist()
      } catch (e) {
        if (!isNetworkError(e)) throw e
        this.queueAction(action)
      }
    },

    // Een actie die regels toevoegt: in de outbox, en de regels er alvast bij. Geeft de
    // nieuwe regels terug (zoals de server zou doen), voor de melding "… staat op je lijst".
    queueAction(action) {
      const before = new Set(this.items)
      const queued = this.enqueue(action)
      this.items = applyShoppingAction(this.items, queued, { categoryOf })
      return this.items.filter((item) => !before.has(item))
    },

    // Een los item, getypt bovenaan de boodschappenlijst ("3 uien"). ingredientId: de
    // gekozen suggestie, of null voor vrije tekst (dan geen nieuw ingrediënt). Staat
    // hetzelfde ingrediënt (of dezelfde naam) er al open op zonder hoeveelheid, dan telt
    // count daar bij op, zoals de server doet (ShoppingListItem.add_loose!). Altijd via de
    // outbox-vorm (met een uuid), ook online: dan is opnieuw versturen nooit dubbel.
    // Geeft de regel terug.
    async addLoose(name, { ingredientId = null, count = 1 } = {}) {
      const match = looseMatch(this.items, { name, ingredientId })
      if (match && isTempId(match.id)) {
        // Wacht zelf nog op sync: het aantal van die (nog niet verstuurde) regel omhoog.
        await this.setCount(match.id, Math.min(match.count + count, MAX_COUNT))
        return match
      }
      const action = {
        id: newId(),
        type: 'shopping.addLoose',
        kind: 'call',
        payload: { name, ingredient_id: ingredientId, count, into: match?.id ?? null },
      }
      if (!match) action.target = lineTarget(`tmp:${action.id}`)
      if (this.queues()) return this.queueAction(action)[0] ?? match

      this.changes++
      this.inFlight++
      try {
        const [line] = await api.addLooseItem({
          name,
          count,
          ingredient_id: ingredientId,
          client_action_id: action.id,
        })
        if (line) this.putLine(line.id, line)
        this.persist()
        return line
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return this.queueAction(action)[0] ?? match
      } finally {
        this.inFlight--
      }
    },

    // De stepper ([−] 2 [+]) of een getypt aantal. Optimistisch: het nieuwe aantal staat er
    // meteen, het request volgt pas COUNT_DELAY ms na de laatste tik (debounce). De belofte
    // van de laatste tik volgt dat request; een eerdere tik is dan meteen klaar. Mislukt het
    // opslaan, dan staat het aantal van vóór de eerste tik terug en gooien we de fout door
    // voor de melding. Een regel die al weg is (404) verdwijnt hier ook.
    // Zolang er een aantal wacht of onderweg is, telt dat als inFlight: een load() van
    // tussendoor zet het oude aantal dan niet terug.
    setCount(id, count) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return Promise.resolve()
      if (this.queues(id)) {
        item.count = count
        this.enqueue({
          type: 'shopping.count',
          kind: 'set',
          target: lineTarget(id),
          payload: { count },
        })
        return Promise.resolve()
      }
      const pending = pendingCounts.get(id)
      if (pending) {
        clearTimeout(pending.timer)
        pending.resolve()
      } else {
        this.inFlight++
      }
      const before = pending ? pending.before : item.count
      item.count = count
      this.changes++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingCounts.delete(id)
          this.saveCount(id, count, before).then(resolve, reject)
        }, COUNT_DELAY)
        pendingCounts.set(id, { timer, before, resolve })
      })
    },

    async saveCount(id, count, before) {
      try {
        const saved = await api.updateShoppingListItem(id, { count })
        // Is er intussen opnieuw getikt, dan wint dat aantal.
        if (!pendingCounts.has(id)) this.putLine(id, saved)
        this.persist()
      } catch (e) {
        if (isNetworkError(e)) {
          // Geen verbinding: het aantal blijft staan en gaat later via de outbox.
          if (!pendingCounts.has(id)) {
            this.enqueue({
              type: 'shopping.count',
              kind: 'set',
              target: lineTarget(id),
              payload: { count },
            })
          }
          return
        }
        if (e.kind === 'not_found') {
          this.putLine(id, null)
        } else {
          const item = this.items.find((i) => i.id === id)
          if (item && !pendingCounts.has(id) && item.count === count) item.count = before
        }
        throw e
      } finally {
        this.inFlight--
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
    // Offline (of als de verbinding onderweg wegvalt) via de outbox: de regels staan er
    // alvast, uitgerekend uit het recept in de offline snapshot. Bij "Alles op lijst" kijkt
    // de server bij het versturen zelf wat dan in huis is (skip_in_house).
    async addRecipe(recipeId, servings, ingredientIds = null, alternativeIds = [], skipIds = []) {
      const action = {
        id: newId(),
        type: 'shopping.addRecipe',
        kind: 'call',
        payload: {
          recipe_id: recipeId,
          servings,
          ingredient_ids: ingredientIds,
          alternative_ids: alternativeIds,
          skip_in_house: ingredientIds == null,
        },
      }
      const queue = () => {
        const recipe = useSnapshotStore().recipe(recipeId)
        action.preview = recipe
          ? recipeLines(recipe, { servings, ingredientIds, alternativeIds, skipIds })
          : []
        return this.queueAction(action)
      }
      if (this.queues()) return queue()
      this.changes++
      try {
        const lines = await addRecipeToShoppingList(
          recipeId,
          servings,
          ingredientIds,
          alternativeIds,
          skipIds,
          { clientActionId: action.id },
        )
        this.items.push(...lines)
        this.persist()
        return lines
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return queue()
      }
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
    // Offline net als addRecipe; de server kijkt bij het versturen zelf wat in huis is.
    async addVariation(recipeId, variationId, servings, alternativeIds = [], skip = {}) {
      const action = {
        id: newId(),
        type: 'shopping.addVariation',
        kind: 'call',
        payload: {
          recipe_id: recipeId,
          variation_id: variationId,
          servings,
          alternative_ids: alternativeIds,
        },
      }
      const queue = () => {
        const recipe = useSnapshotStore().recipe(recipeId)
        const variation = recipe?.variations.find((v) => v.id === variationId)
        action.preview = variation
          ? variationLines(recipe, variation, { servings, alternativeIds, skip })
          : []
        return this.queueAction(action)
      }
      if (this.queues()) return queue()
      this.changes++
      try {
        const lines = await addVariationToShoppingList(
          recipeId,
          variationId,
          servings,
          alternativeIds,
          skip,
          { clientActionId: action.id },
        )
        this.items.push(...lines)
        this.persist()
        return lines
      } catch (e) {
        if (!isNetworkError(e)) throw e
        return queue()
      }
    },

    // Optimistisch: het vinkje staat er meteen, het request volgt. Naar de server gaat de
    // nieuwe waarde (checked: true of false), nooit "draai om".
    // Zonder verbinding gaat die waarde in de wachtrij en blijft het vinkje gewoon staan.
    // Weigert de server, dan draaien we het terug en gooien we de fout door, zodat de
    // pagina een melding toont. Heeft iemand anders de regel al verwijderd, dan
    // verdwijnt hij hier ook.
    async toggle(id) {
      const item = this.items.find((i) => i.id === id)
      if (!item || item.locked) return
      const checked = !item.checked
      item.checked = checked
      const action = {
        type: 'shopping.check',
        kind: 'set',
        target: lineTarget(id),
        payload: { checked },
      }
      if (this.queues(id)) {
        this.enqueue(action)
        return
      }
      this.changes++
      const offline = useOfflineStore()
      // Een oudere offline actie voor deze regel mag deze waarde later niet overschrijven.
      offline.discardSets(lineTarget(id), 'shopping.check')
      this.inFlight++
      try {
        await api.updateShoppingListItem(id, { checked })
        this.persist()
        // De server is weer bereikbaar: verstuur wat er nog wachtte en ververs.
        if (this.offline || offline.pending > 0) this.load().catch(() => {})
      } catch (e) {
        if (isNetworkError(e)) {
          this.enqueue(action)
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

    // Al door iemand anders verwijderd (404) is ook goed: weg is weg. Offline (of voor een
    // regel die zelf nog op sync wacht) via de outbox; die is dan meteen weg.
    async remove(id) {
      const item = this.items.find((i) => i.id === id)
      if (item?.locked) return
      const action = { type: 'shopping.delete', kind: 'delete', target: lineTarget(id) }
      if (this.queues(id)) {
        this.enqueue(action)
        this.items = this.items.filter((i) => i.id !== id)
        return
      }
      this.changes++
      try {
        await api.deleteShoppingListItem(id)
      } catch (e) {
        if (isNetworkError(e)) {
          this.enqueue(action)
        } else if (e.kind !== 'not_found') {
          throw e
        }
      }
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
    },

    // "✓ op lijst" op de receptpagina: haalt het receptdeel weg van alle open regels van dit
    // ingrediënt met dit recept als herkomst. Regels uit een andere herkomst blijven staan.
    // Was zo'n regel ook van de standaardlijst bijgeteld (standard_count > 0), dan blijft
    // hij staan als standaardregel ("melk", één minder); anders verdwijnt hij.
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
