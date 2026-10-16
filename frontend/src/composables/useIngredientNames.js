import { ref } from 'vue'
import { fetchIngredients } from '@/api/ingredients'

// De namen van alle bestaande ingrediënten, voor "Bedoel je: …?" in de formulieren.
// Eén keer per bezoek opgehaald en gedeeld door alle formulieren. Lukt het niet (offline),
// dan is de lijst leeg en is er gewoon geen suggestie.
const names = ref([])
let loading = null

export function useIngredientNames() {
  loading ??= fetchIngredients()
    .then((list) => (names.value = list.map((ingredient) => ingredient.name)))
    .catch(() => {
      loading = null
    })
  return names
}
