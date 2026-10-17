<script setup>
import { computed, ref } from 'vue'
import HouseButton from '@/components/HouseButton.vue'
import ShoppingListButton from '@/components/ShoppingListButton.vue'
import { useHouseStatus } from '@/composables/useHouseStatus'
import { useTimedMessage } from '@/composables/useTimedMessage'
import { useShoppingListStore } from '@/stores/shoppingList'
import { applySwaps, swappedAlternativeIds, swapRow } from '@/utils/alternatives'
import { alternativeHint, skippedMessage, splitInHouse } from '@/utils/inHouse'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

// De ingrediënten op de receptpagina, geschaald naar het gekozen aantal porties, met
// "+ lijst" (of "✓ op lijst", zie ShoppingListButton) per ingrediënt en "Alles op lijst". Onder een ingrediënt met alternatieven
// staan chips: "⇄ tofu" wisselt, "↺ kip" zet het origineel terug.
// Naast de lijstknop het huisje (HouseButton): in huis of niet, een tik zet het om. Is het
// ingrediënt niet in huis maar een alternatief wel, dan "tofu in huis → wissel".
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
const { message: addedMessage, show: confirmAdded, hide: hideAdded } = useTimedMessage()
const addError = ref(null)
// De regel (id) waarvoor toevoegen of weghalen loopt; alleen tegen dubbel tikken. Of iets
// op de lijst staat, komt uit de store.
const busyId = ref(null)

// ingredientIds null: alles behalve de optionele ingrediënten. De gewisselde
// ingrediënten gaan als hun alternatief mee; de herkomst blijft het recept.
// message: een tekst, of een functie die de nieuwe regels krijgt.
async function addToShoppingList(ingredientIds, message, skipIds = []) {
  addError.value = null
  try {
    const lines = await shoppingList.addRecipe(
      props.recipe.id,
      props.servings,
      ingredientIds,
      swappedAlternativeIds(swaps.value),
      skipIds,
    )
    confirmAdded(typeof message === 'function' ? message(lines) : message)
  } catch (e) {
    hideAdded()
    addError.value = e.message
  }
}

async function addToList(ingredient) {
  busyId.value = ingredient.id
  try {
    await addToShoppingList([ingredient.id], `${ingredient.name} staat op je boodschappenlijst.`)
  } finally {
    busyId.value = null
  }
}

// "✓ op lijst": weg met de regels die dit recept voor dit ingrediënt op de lijst zette.
// Geen bevestiging: nog een tik zet het terug.
async function removeFromList(ingredient) {
  addError.value = null
  busyId.value = ingredient.id
  try {
    await shoppingList.removeFromRecipe(ingredient, props.recipe.id)
    confirmAdded(`${ingredient.name} is van je boodschappenlijst gehaald.`)
  } catch (e) {
    hideAdded()
    addError.value = e.message
  } finally {
    busyId.value = null
  }
}

const { statusOf } = useHouseStatus()

// Optionele ingrediënten laat de server weg: die zet je los op de lijst met "+ lijst".
// Wat in huis is (zoals het huisje het toont, dus na wisselen) slaan we ook over; "+ lijst"
// zet het wel op de lijst.
function addAllToList() {
  const hasOptional = scaledIngredients.value.some((ingredient) => ingredient.optional)
  const { inHouse } = splitInHouse(
    scaledIngredients.value.filter((ingredient) => !ingredient.optional),
    statusOf,
  )
  addToShoppingList(
    null,
    (lines) =>
      skippedMessage(lines.length, inHouse.length) ??
      (hasOptional
        ? 'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.'
        : 'Alle ingrediënten staan op je boodschappenlijst.'),
    inHouse.map((ingredient) => ingredient.id),
  )
}

// Per regel (id) de wissel-hint, of null.
const hints = computed(
  () => new Map(scaledIngredients.value.map((row) => [row.id, alternativeHint(row, statusOf)])),
)

// "kidneybonen in huis → wissel", met "+1" als er nog meer alternatieven in huis zijn.
function hintText(hint) {
  return `${hint.name} in huis → wissel${hint.more ? ` (+${hint.more})` : ''}`
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
          <div class="row-buttons">
            <HouseButton :ingredient="ingredient" @error="addError = $event" />
            <ShoppingListButton
              :ingredient="ingredient"
              :recipe-id="recipe.id"
              :busy="busyId === ingredient.id"
              @add="addToList(ingredient)"
              @remove="removeFromList(ingredient)"
            />
          </div>
        </div>
        <button
          v-if="hints.get(ingredient.id)"
          type="button"
          class="house-hint"
          @click="swap(ingredient, hints.get(ingredient.id).alternativeId)"
        >
          {{ hintText(hints.get(ingredient.id)) }}
        </button>
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

/* Huisje en lijstknop naast elkaar, nooit onder elkaar. */
.row-buttons {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-1);
  align-items: center;
}

/* Klein en amber, zoals het huisje: een tip, geen hoofdzaak. */
.house-hint {
  min-height: 0;
  margin: 0 0 var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-house-text);
  background: var(--color-house-soft);
  border-color: transparent;
  border-radius: var(--radius-full);
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

.added {
  margin: var(--space-3) 0 0;
}
</style>
