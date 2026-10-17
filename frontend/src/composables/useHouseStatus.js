import { computed } from 'vue'
import { useIngredientList } from '@/composables/useIngredientNames'
import { usePantryStore } from '@/stores/pantry'
import { houseStatus, ingredientIdsByName } from '@/utils/inHouse'

// Staat een ingrediënt in huis? Voor componenten op de receptpagina en de standaardlijst.
// De voorraad komt uit de pantry-store (één bron, dus na een tik klopt het overal), de
// ingrediënten voor matchen op naam uit useIngredientList (één keer per bezoek).
//
//   const { statusOf } = useHouseStatus()
//   statusOf({ ingredient_id: 12, name: 'zout' })  // { ingredientId: 12, inHouse: true } of null
export function useHouseStatus() {
  const pantry = usePantryStore()
  const ingredients = useIngredientList()
  const lookup = computed(() => ({
    presentIds: pantry.presentIds,
    idByName: ingredientIdsByName(ingredients.value),
  }))

  return { statusOf: (ingredient) => houseStatus(ingredient, lookup.value) }
}
