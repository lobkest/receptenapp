<script setup>
import { computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'

// De knop naast een ingrediënt op de receptpagina (en bij een toevoeging van een variatie).
// Wat hij toont komt uit de boodschappenlijst-store, niet uit eigen state:
//   niet op de lijst         → "+ lijst"            (emit add)
//   op de lijst via dit recept → "✓ op lijst"       (emit remove: haalt die regels weg)
//   alleen via iets anders   → "✓ via standaardlijst" / "✓ via <recept>", niet klikbaar
const props = defineProps({
  // { ingredient_id, name }; ingredient_id mag ontbreken, dan telt de naam.
  ingredient: { type: Object, required: true },
  recipeId: { type: Number, required: true },
  // true terwijl het toevoegen of weghalen loopt: geen dubbele tik.
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['add', 'remove'])

const shoppingList = useShoppingListStore()
const status = computed(() => shoppingList.listStatus(props.ingredient, props.recipeId))
const state = computed(() => {
  if (!status.value.onList) return 'add'
  return status.value.own.length > 0 ? 'own' : 'via'
})
</script>

<template>
  <button
    v-if="state === 'add'"
    type="button"
    class="list-button add"
    :disabled="busy"
    :aria-label="`${ingredient.name} op boodschappenlijst`"
    @click="emit('add')"
  >
    + lijst
  </button>
  <button
    v-else-if="state === 'own'"
    type="button"
    class="list-button own"
    :disabled="busy"
    :aria-label="`${ingredient.name} staat op je boodschappenlijst; tik om weg te halen`"
    @click="emit('remove')"
  >
    ✓ op lijst
  </button>
  <!-- Staat er via iets anders op: dat haal je daar weg, niet hier. -->
  <button
    v-else
    type="button"
    class="list-button via"
    disabled
    :title="`Op je boodschappenlijst via ${status.via}`"
    :aria-label="`${ingredient.name} staat op je boodschappenlijst via ${status.via}`"
  >
    <span class="via-text">✓ via {{ status.via }}</span>
  </button>
</template>

<style scoped>
.list-button {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

.add {
  color: var(--color-accent-text);
  border-color: var(--color-border);
}

/* Gevuld groen: in één oogopslag anders dan "+ lijst". */
.own,
.own:hover:not(:disabled) {
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

/* Licht groen en niet klikbaar; niet half doorzichtig zoals andere uitgeschakelde knoppen,
   want het is informatie. Hooguit 60% van de regel: een lange receptnaam wordt afgekapt
   (de volledige naam staat in title en aria-label). */
.via,
.via:disabled {
  max-width: 60%;
  font-weight: 600;
  color: var(--color-success-text);
  cursor: default;
  background: var(--color-success-soft);
  border-color: transparent;
  opacity: 1;
}

.via-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
