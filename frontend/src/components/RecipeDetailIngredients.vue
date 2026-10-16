<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

// De ingrediënten op de receptpagina, geschaald naar het gekozen aantal porties, met
// "+ lijst" per ingrediënt en "Alles op lijst".
const props = defineProps({
  // Het recept zoals de API het stuurt: { id, servings, ingredients }.
  recipe: { type: Object, required: true },
  servings: { type: Number, required: true },
})

// Elke hoeveelheid × (gekozen / origineel), afgerond per eenheid. Alleen voor het scherm:
// geen request per tik op + of −. "Naar smaak" (null) blijft null.
const scaledIngredients = computed(() => {
  const factor = props.servings / props.recipe.servings
  return props.recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: scaleQuantity(ingredient.quantity, factor, ingredient.unit),
  }))
})

// "200 g bloem", "2 stuks ei"; zonder hoeveelheid alleen de naam ("zout"). Getallen als
// 0,5 in plaats van 0.5.
function ingredientLine(ingredient) {
  if (ingredient.quantity == null) return ingredient.name

  return `${formatQuantity(ingredient.quantity)} ${ingredient.unit} ${ingredient.name}`
}

// Boodschappenlijst: de server rekent de hoeveelheden uit voor het gekozen aantal
// porties, met dezelfde afronding als hierboven op het scherm (beide getest met
// test/fixtures/files/quantity_cases.json). De lijst staat op de server, dus dit kan mislukken.
// De store is gedeeld: de teller in het menu telt mee.
const shoppingList = useShoppingListStore()
const addedMessage = ref(null)
const addError = ref(null)
let messageTimer = null

function confirmAdded(message) {
  addedMessage.value = message
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (addedMessage.value = null), 3000)
}

onUnmounted(() => clearTimeout(messageTimer))

// ingredientIds null: alles behalve de optionele ingrediënten.
async function addToShoppingList(ingredientIds, message) {
  addError.value = null
  try {
    await shoppingList.addRecipe(props.recipe.id, props.servings, ingredientIds)
    confirmAdded(message)
  } catch (e) {
    addedMessage.value = null
    addError.value = e.message
  }
}

function addToList(ingredient) {
  addToShoppingList([ingredient.id], `${ingredient.name} staat op je boodschappenlijst.`)
}

// Optionele ingrediënten laat de server weg: die zet je los op de lijst met "+ lijst".
function addAllToList() {
  const hasOptional = props.recipe.ingredients.some((ingredient) => ingredient.optional)
  addToShoppingList(
    null,
    hasOptional
      ? 'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.'
      : 'Alle ingrediënten staan op je boodschappenlijst.',
  )
}
</script>

<template>
  <section class="ingredients card">
    <h2>Ingrediënten</h2>
    <ul>
      <li v-for="ingredient in scaledIngredients" :key="ingredient.id">
        <span class="line">
          {{ ingredientLine(ingredient) }}
          <span v-if="ingredient.optional" class="optional muted">(optioneel)</span>
        </span>
        <button
          type="button"
          class="add-one"
          :aria-label="`${ingredient.name} op boodschappenlijst`"
          @click="addToList(ingredient)"
        >
          + lijst
        </button>
      </li>
    </ul>
    <button type="button" class="add-all btn-primary btn-block" @click="addAllToList">
      Alles op lijst
    </button>
    <p v-if="addedMessage" class="added notice notice-success" role="status">
      {{ addedMessage }}
    </p>
    <p v-if="addError" class="added notice notice-error" role="alert">{{ addError }}</p>
  </section>
</template>

<style scoped>
.ingredients {
  margin-bottom: var(--space-6);
}

.ingredients ul {
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.ingredients li {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border);
}

.ingredients li:last-child {
  border-bottom: 0;
}

.optional {
  font-size: var(--text-sm);
}

.ingredients .add-one {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  border-color: var(--color-border);
}

.added {
  margin: var(--space-3) 0 0;
}
</style>
