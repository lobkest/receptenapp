import { computed, ref } from 'vue'
import { getActivePinia } from 'pinia'
import { fetchIngredients } from '@/api/ingredients'
import { isOffline } from '@/offline'
import { useSnapshotStore } from '@/stores/snapshot'

// Alle bestaande ingrediënten, voor "Bedoel je: …?" in de formulieren, het zoekveld op
// "In huis" en de suggesties op de boodschappenlijst. Eén keer per bezoek opgehaald en
// gedeeld. Tot dan (en offline) de namen uit de offline snapshot ({ id, name }); zonder
// snapshot is de lijst leeg en is er gewoon geen suggestie.
const list = ref([])
const names = computed(() => list.value.map((ingredient) => ingredient.name))
let loading = null

function load() {
  // Zonder Pinia (een component los getest) geen snapshot.
  if (!list.value.length && getActivePinia()) {
    const snapshot = useSnapshotStore()
    snapshot.restore()
    list.value = snapshot.ingredients
  }
  // Offline geen request (dat mislukt toch); de volgende keer online wel.
  if (isOffline()) return
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
