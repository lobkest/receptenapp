<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useShoppingListStore } from '@/stores/shoppingList'
import { applySwaps, swappedAlternativeIds, swapRow } from '@/utils/alternatives'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

// De ingrediënten op de receptpagina, geschaald naar het gekozen aantal porties, met
// "+ lijst" per ingrediënt en "Alles op lijst". Onder een ingrediënt met alternatieven
// staan chips: "⇄ tofu" wisselt, "↺ kip" zet het origineel terug.
const props = defineProps({
  // Het recept zoals de API het stuurt: { id, servings, ingredients }.
  recipe: { type: Object, required: true },
  servings: { type: Number, required: true },
})

// De wissels { regel-id: alternatief-id }. De pagina bewaart ze (in de URL), want ook
// "Variatie op lijst" rekent ermee.
const swaps = defineModel('swaps', { type: Object, default: () => ({}) })

// Eerst wisselen, dan elke hoeveelheid × (gekozen / origineel), afgerond per eenheid.
// Alleen voor het scherm: geen request per tik op + of −. "Naar smaak" (null) blijft null.
const scaledIngredients = computed(() => {
  const factor = props.servings / props.recipe.servings
  return applySwaps(props.recipe.ingredients, swaps.value).map((ingredient) => ({
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

// ingredientIds null: alles behalve de optionele ingrediënten. De gewisselde
// ingrediënten gaan als hun alternatief mee; de herkomst blijft het recept.
async function addToShoppingList(ingredientIds, message) {
  addError.value = null
  try {
    await shoppingList.addRecipe(
      props.recipe.id,
      props.servings,
      ingredientIds,
      swappedAlternativeIds(swaps.value),
    )
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

// alternativeId null: terug naar het origineel.
function swap(ingredient, alternativeId) {
  swaps.value = swapRow(swaps.value, ingredient.id, alternativeId)
}
</script>

<template>
  <section class="ingredients card">
    <h2>Ingrediënten</h2>
    <ul>
      <li
        v-for="ingredient in scaledIngredients"
        :key="ingredient.id"
        :class="{ swapped: ingredient.original }"
        :data-id="ingredient.id"
      >
        <div class="main">
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
        </div>
        <!-- Ook zonder kleur te begrijpen: ⇄ wisselt, ↺ zet het origineel terug. -->
        <ul
          v-if="ingredient.original || ingredient.others.length"
          class="alternatives"
          :aria-label="`Alternatieven voor ${ingredient.original?.name ?? ingredient.name}`"
        >
          <li v-if="ingredient.original">
            <button
              type="button"
              class="chip chip-back"
              :aria-label="`Terug naar ${ingredient.original.name}`"
              @click="swap(ingredient, null)"
            >
              ↺ {{ ingredient.original.name }}
            </button>
          </li>
          <li v-for="alternative in ingredient.others" :key="alternative.id">
            <button
              type="button"
              class="chip"
              :aria-label="`Wissel voor ${alternative.name}`"
              @click="swap(ingredient, alternative.id)"
            >
              ⇄ {{ alternative.name }}
            </button>
          </li>
        </ul>
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

.ingredients > ul > li {
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border);
}

.ingredients > ul > li:last-child {
  border-bottom: 0;
}

.main {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.line {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Gewisseld: de regel zelf in de accentkleur, zodat je ziet dat hij afwijkt. */
.swapped .line {
  font-weight: 600;
  color: var(--color-accent-text);
}

/* Chips onder het ingrediënt, licht van kleur; de hele chip is het tikvlak (--tap hoog). */
.ingredients .alternatives {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  margin: 0 0 var(--space-1);
  padding: 0;
  list-style: none;
}

.chip {
  max-width: 100%;
  min-height: var(--tap);
  padding: 0 var(--space-3);
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent-text);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-brand-soft);
  border: 0;
  border-radius: var(--radius-full);
}

.chip-back {
  color: var(--color-text-muted);
  background: transparent;
  border: 1px dashed var(--color-border);
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
