<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import RecipeCardContent from '@/components/RecipeCardContent.vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { matchHints, matchSwaps } from '@/utils/ingredientSearch'

const props = defineProps({
  recipe: { type: Object, required: true },
})

// Gevonden met "Met ingrediënt…": dan staat er onder de tags hoe het recept matcht en wat
// je nog moet kopen, met een knop "Ontbrekende op lijst". Een knop mag niet in een link,
// dus dan is de kaart een vak met de link en de knop naast elkaar erin.
const match = computed(() => props.recipe.ingredient_match ?? null)
const hints = computed(() => matchHints(match.value))
const missingNames = computed(() => (match.value?.missing ?? []).map((row) => row.name))

// Gevonden via een alternatief: het recept opent met die wissel aan ("⇄ courgette").
const to = computed(() => {
  const wissel = matchSwaps(match.value)
  return wissel
    ? { path: `/recepten/${props.recipe.id}`, query: { wissel } }
    : `/recepten/${props.recipe.id}`
})

// ---------- Ontbrekende op lijst ----------

// Hetzelfde als op "In huis": de ontbrekende regels (het origineel, niet de gekozen
// ingrediënten: die tellen als in huis) met de porties van het recept zelf.
const adding = ref(false)
const added = ref(false)
const error = ref(null)

async function addMissing() {
  if (adding.value) return
  adding.value = true
  error.value = null
  try {
    await useShoppingListStore().addRecipe(
      props.recipe.id,
      props.recipe.servings,
      match.value.missing.map((row) => row.id),
    )
    added.value = true
  } catch (e) {
    error.value = e.message
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div v-if="match" class="card recipe-card search-card">
    <RouterLink :to="to" class="card-link">
      <RecipeCardContent :recipe="recipe">
        <p v-if="hints.length" class="match-hint">{{ hints.join(' · ') }}</p>
        <p class="to-buy" :title="missingNames.join(', ') || null">
          nog kopen: {{ match.missing_count
          }}<span v-if="missingNames.length" class="to-buy-names">
            ({{ missingNames.join(', ') }})</span
          >
        </p>
      </RecipeCardContent>
    </RouterLink>
    <div v-if="match.missing_count" class="actions">
      <p v-if="added" class="added" role="status">Op de lijst ✓</p>
      <button v-else type="button" class="add-missing" :disabled="adding" @click="addMissing">
        Ontbrekende op lijst
      </button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </div>

  <!-- De hele kaart is één link. -->
  <RouterLink v-else :to="to" class="card recipe-card">
    <RecipeCardContent :recipe="recipe" />
  </RouterLink>
</template>

<style scoped>
/* .card geeft rand, achtergrond en ronde hoeken. */
.recipe-card {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  color: var(--color-text);
  text-decoration: none;
  transition:
    border-color var(--duration) ease,
    box-shadow var(--duration) ease;
}

.recipe-card:hover,
.search-card:has(.card-link:hover) {
  color: var(--color-text);
  border-color: var(--color-brand);
  box-shadow: var(--shadow);
}

.search-card:hover {
  border-color: var(--color-border);
  box-shadow: none;
}

.card-link {
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  text-decoration: none;
}

.card-link:hover {
  color: var(--color-text);
}

/* Kort houden: hoogstens twee regels uitleg en één regel "nog kopen". */
.match-hint {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  line-height: 1.3;
  color: var(--color-accent-text);
  overflow-wrap: anywhere;
}

.to-buy {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.to-buy-names {
  font-weight: 400;
}

.actions {
  padding: 0 var(--space-3) var(--space-3);
}

.add-missing {
  width: 100%;
  font-size: var(--text-sm);
}

.added {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success-text);
}

.error {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-error-text);
}
</style>
