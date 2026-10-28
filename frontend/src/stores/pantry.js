import { defineStore } from 'pinia'
import * as api from '@/api/pantry'
import { presentIngredientIds } from '@/utils/inHouse'
import { normalizeName } from '@/stores/shoppingList'

// Telt elke loadRecipes(): alleen het antwoord op de laatste telt (snel filters aantikken).
let latestRecipes = 0
// Per store een lopende loadPantry(), zodat de pagina en App.vue die tegelijk aanroepen
// maar één request doen. Per store (niet één variabele), zodat een nieuwe Pinia (in de
// tests) nooit het antwoord voor een oude krijgt.
const pendingPantry = new WeakMap()

// "In huis": de voorraad en de recepten die je ermee kunt maken. Alles staat op de server
// (één voorraad voor iedereen met de link); hier alleen wat de pagina laat zien. De pagina
// ververst bij openen en bij terugkeren naar de app, net als de lijsten.
export const usePantryStore = defineStore('pantry', {
  state: () => ({
    // Zoals /api/pantry: { in_house, staples, suggestions }, of null voor het laden.
    pantry: null,
    // Zoals /api/pantry/recipes: drie groepen (0, 1 en 2 ontbrekend).
    groups: [],
    // Het tagfilter van de laatste loadRecipes().
    tags: [],
    // Een ingrediënt dat nu wordt opgeslagen (id, of de naam als er nog geen id is), zodat
    // je niet twee keer tikt.
    busy: new Set(),
  }),

  getters: {
    inHouse: (state) => state.pantry?.in_house ?? [],
    staples: (state) => state.pantry?.staples ?? [],
    suggestions: (state) => state.pantry?.suggestions ?? [],
    // Nog niets aangepast: niets extra in huis en geen basis op.
    isDefault: (state) =>
      !!state.pantry &&
      state.pantry.in_house.length === 0 &&
      state.pantry.staples.every((staple) => staple.present),
    // De ingrediënt-ids die in huis zijn (ook de basis die niet op is), of null voor het
    // laden. Voor het huisje op de receptpagina en de standaardlijst (src/utils/inHouse.js).
    presentIds: (state) => presentIngredientIds(state.pantry),
    // Alle recepten uit de drie groepen, voor de categorie-chips.
    allRecipes: (state) => state.groups.flatMap((group) => group.recipes),
  },

  actions: {
    // Voorraad en recepten tegelijk. Een fout gooien we door (de pagina laat de serverstatus
    // opnieuw kijken); de oude stand blijft staan.
    async load(tags = this.tags) {
      await Promise.all([this.loadPantry(), this.loadRecipes(tags)])
    },

    loadPantry() {
      if (pendingPantry.has(this)) return pendingPantry.get(this)
      const pending = api
        .fetchPantry()
        .then((pantry) => {
          // Een onverwacht antwoord (geen voorraad): niet overnemen, dan liever geen huisjes.
          if (!Array.isArray(pantry?.in_house) || !Array.isArray(pantry?.staples)) {
            throw new TypeError('geen voorraad')
          }
          this.pantry = pantry
        })
        .finally(() => pendingPantry.delete(this))
      pendingPantry.set(this, pending)
      return pending
    },

    async loadRecipes(tags = this.tags) {
      const current = ++latestRecipes
      this.tags = tags
      const groups = await api.fetchPantryRecipes({ tags })
      if (current === latestRecipes) this.groups = groups
    },

    // In huis (true) of eruit (false). Daarna de recepten opnieuw, want wat ontbreekt
    // is veranderd. Een fout gooien we door: de pagina toont een melding.
    async set(ingredientId, present) {
      if (this.busy.has(ingredientId)) return
      this.busy.add(ingredientId)
      try {
        this.pantry = await api.setInHouse(ingredientId, present)
        await this.loadRecipes()
      } finally {
        this.busy.delete(ingredientId)
      }
    },

    // Het huisje op de receptpagina en de standaardlijst: in huis of eruit, zonder de
    // recepten van "In huis" opnieuw te laden (die pagina doet dat zelf bij openen).
    // Optimistisch: het huisje verandert meteen; weigert de server, dan zetten we de oude
    // voorraad terug en gooien we de fout door voor de melding.
    // Zonder ingredientId (standaarditem dat nog geen ingrediënt is) gaat het op naam: de
    // server maakt het ingrediënt dan aan. Niet optimistisch, want het id is er nog niet;
    // busy is dan de naam.
    async toggleInHouse(ingredientId, name, present) {
      const key = ingredientId ?? normalizeName(name)
      if (this.busy.has(key) || !this.pantry) return
      this.busy.add(key)
      const before = this.pantry
      if (ingredientId != null)
        this.pantry = withPresence(before, { id: ingredientId, name }, present)
      try {
        this.pantry =
          ingredientId != null
            ? await api.setInHouse(ingredientId, present)
            : await api.setInHouseByName(name, present)
      } catch (e) {
        this.pantry = before
        throw e
      } finally {
        this.busy.delete(key)
      }
    },

    async reset() {
      this.pantry = await api.resetPantry()
      await this.loadRecipes()
    },
  },
})

// De voorraad met één ingrediënt in huis (present true) of eruit, zoals de server het zou
// opslaan: basis staat in staples (present), de rest in in_house.
function withPresence(pantry, ingredient, present) {
  if (pantry.staples.some((staple) => staple.id === ingredient.id)) {
    return {
      ...pantry,
      staples: pantry.staples.map((staple) =>
        staple.id === ingredient.id ? { ...staple, present } : staple,
      ),
    }
  }
  const others = pantry.in_house.filter((item) => item.id !== ingredient.id)
  return { ...pantry, in_house: present ? [...others, ingredient] : others }
}
