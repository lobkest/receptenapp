<script setup>
import { computed } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'

// De knop naast een ingrediënt op de receptpagina (en bij een toevoeging van een variatie).
// Wat hij toont komt uit de boodschappenlijst-store, niet uit eigen state:
//   niet op de lijst         → "+ lijst"            (emit add)
//   op de lijst via dit recept → "✓ op lijst"       (emit remove: haalt die regels weg)
//   alleen via iets anders   → "✓ op lijst" met de herkomst klein eronder ("standaard",
//                              "<recept>"), niet klikbaar; ernaast een kleine "+" die toch
//                              een eigen regel van dit recept toevoegt (emit add)
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
  <!-- Staat er via iets anders op: dat haal je daar weg, niet hier. De "+" zet er een eigen
       regel van dit recept bij; daarna is het "✓ op lijst" van dit recept. -->
  <span v-else class="via-group">
    <span class="via" :title="`Op je boodschappenlijst via ${status.via}`">
      <span class="via-check">✓ op lijst</span>
      <span class="via-source"><span class="visually-hidden">via </span>{{ status.via }}</span>
    </span>
    <button
      type="button"
      class="add-own"
      :disabled="busy"
      :aria-label="`${ingredient.name} ook voor dit recept op boodschappenlijst`"
      @click="emit('add')"
    >
      +
    </button>
  </span>
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

.via-group {
  display: inline-flex;
  flex-shrink: 0;
  gap: var(--space-1);
  align-items: center;
}

/* Licht groen en niet klikbaar: informatie, geen knop. "✓ op lijst" altijd heel; de
   herkomst klein eronder, een lange receptnaam afgekapt (de volledige naam staat in title
   en aria-label). */
.via {
  display: inline-flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  padding: 2px var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-success-text);
  background: var(--color-success-soft);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.via-check {
  white-space: nowrap;
}

.via-source {
  max-width: 6.5rem;
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Klein vierkant: "nog één van dit recept". */
.add-own {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-height: 0;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
  color: var(--color-accent-text);
  border-color: var(--color-border);
}

/* Voor de schermlezer: "✓ op lijst via standaard". */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
