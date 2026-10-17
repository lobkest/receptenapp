import { computed, ref } from 'vue'
import { fetchIngredients } from '@/api/ingredients'

// Alle bestaande ingrediënten, voor "Bedoel je: …?" in de formulieren en het zoekveld op
// "In huis". Eén keer per bezoek opgehaald en gedeeld. Lukt het niet (offline), dan is de
// lijst leeg en is er gewoon geen suggestie.
const list = ref([])
const names = computed(() => list.value.map((ingredient) => ingredient.name))
let loading = null

function load() {
  loading ??= fetchIngredients()
    .then((ingredients) => {
      if (!Array.isArray(ingredients)) throw new TypeError('geen lijst met ingrediënten')
      list.value = ingredients
    })
    .catch(() => {
      loading = null
    })
}

// De namen: ['bloem', 'ei', ...].
export function useIngredientNames() {
  load()
  return names
}

// Met id: [{ id, name, ... }], zoals /api/ingredients ze geeft.
export function useIngredientList() {
  load()
  return list
}
