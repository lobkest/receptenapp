<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  NUTRIENTS,
  amountText,
  citation,
  formatNutrient,
  ingredientRows,
  notCountedText,
  summarize,
  totalFor,
  valuesText,
} from '@/utils/nutrition'

// Onderaan de receptpagina: de geschatte voedingswaarde, standaard dichtgeklapt. De server
// rekent per ingrediënt (en per alternatief); hier wordt dat opgeteld met de gekozen
// alternatieven, geschaald naar het gekozen aantal porties, afgerond en toegelicht. Met
// variaties kies je waarvoor.
const props = defineProps({
  // { servings, nutrition, variations: [{ id, name, nutrition }] } zoals de API het stuurt.
  recipe: { type: Object, required: true },
  // Het gekozen aantal porties op de pagina.
  servings: { type: Number, required: true },
  // De gekozen alternatieven: { regel-id: alternatief-id } (utils/alternatives.js).
  swaps: { type: Object, default: () => ({}) },
})

// Variaties waarin iets meetelt; '' is het basisrecept.
const choices = computed(() =>
  (props.recipe.variations ?? []).filter((variation) => variation.nutrition?.counted > 0),
)
const chosenId = ref('')
// Een variatie die verdwijnt (verwijderen aangevraagd): terug naar het basisrecept.
watch(choices, (list) => {
  if (chosenId.value && !list.some((variation) => variation.id === chosenId.value))
    chosenId.value = ''
})

const nutrition = computed(() =>
  summarize(
    choices.value.find((variation) => variation.id === chosenId.value)?.nutrition ??
      props.recipe.nutrition,
    props.swaps,
  ),
)
const total = computed(() => totalFor(nutrition.value.per_serving, props.servings))
// Per ingrediënt: het hele recept, geschaald zoals de ingrediëntenlijst.
const rows = computed(() =>
  ingredientRows(nutrition.value.lines, props.servings / props.recipe.servings),
)
const servingsText = computed(() =>
  props.servings === 1 ? '1 portie' : `${props.servings} porties`,
)

// Een lange lijst niet-meegetelde ingrediënten klapt apart in.
const MANY = 4
const notCounted = computed(() => nutrition.value.not_counted)

function nutrientLabel(key) {
  return NUTRIENTS.find((nutrient) => nutrient.key === key).label
}
</script>

<template>
  <details class="nutrition card">
    <summary>
      <h2>Voedingswaarde</h2>
      <span class="muted">schatting</span>
    </summary>

    <div v-if="choices.length" class="field">
      <label for="nutrition-for">Voor</label>
      <select id="nutrition-for" v-model="chosenId">
        <option value="">Basisrecept</option>
        <option v-for="variation in choices" :key="variation.id" :value="variation.id">
          Variatie: {{ variation.name }}
        </option>
      </select>
    </div>

    <table>
      <thead>
        <tr>
          <th scope="col"><span class="visually-hidden">Voedingsstof</span></th>
          <th scope="col">Per portie</th>
          <th scope="col">Totaal ({{ servingsText }})</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="nutrient in NUTRIENTS" :key="nutrient.key">
          <th scope="row">{{ nutrient.label }}</th>
          <td>{{ formatNutrient(nutrition.per_serving[nutrient.key], nutrient.unit) }}</td>
          <td>{{ formatNutrient(total[nutrient.key], nutrient.unit) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="notes">
      <template v-if="notCounted.length">
        <details v-if="notCounted.length > MANY" class="not-counted">
          <summary>{{ notCountedText(notCounted.length) }}</summary>
          <ul>
            <li v-for="line in notCounted" :key="line.name">{{ line.name }} ({{ line.reason }})</li>
          </ul>
        </details>
        <p v-else class="not-counted">
          {{ notCountedText(notCounted.length) }}:
          {{ notCounted.map((line) => `${line.name} (${line.reason})`).join(', ') }}.
        </p>
      </template>

      <p v-for="(names, key) in nutrition.unknown" :key="key" class="unknown">
        {{ nutrientLabel(key) }} onbekend voor {{ names.join(', ') }}; niet meegeteld.
      </p>

      <details class="per-ingredient">
        <summary>Per ingrediënt</summary>
        <p class="scope">Voor het hele recept ({{ servingsText }}), niet per portie.</p>
        <ul>
          <li v-for="row in rows" :key="row.key" :class="{ skipped: !row.values }">
            <div class="row-top">
              <span class="row-name">
                {{ row.name
                }}<span v-if="row.swappedFrom" class="swapped">
                  (i.p.v. {{ row.swappedFrom }})</span
                >
              </span>
              <span class="row-amount">{{ amountText(row) }}</span>
            </div>
            <template v-if="row.values">
              <div class="row-values">{{ valuesText(row.values) }}</div>
              <div class="row-source">{{ row.source }}</div>
            </template>
            <div v-else class="row-reason">
              Niet meegeteld: {{ row.reason }}.
              <RouterLink
                v-if="row.ingredient_id && row.reason !== 'optioneel'"
                :to="{ name: 'ingredient', params: { id: String(row.ingredient_id) } }"
                >Aanpassen</RouterLink
              >
            </div>
          </li>
        </ul>
      </details>

      <p v-if="citation(nutrition)" class="citation">{{ citation(nutrition) }}</p>
      <p class="disclaimer">Dit is een schatting en niet medisch betrouwbaar.</p>
      <p class="link"><RouterLink to="/ingredienten">Ingrediënten koppelen</RouterLink></p>
    </div>
  </details>
</template>

<style scoped>
.nutrition {
  margin: var(--space-5) 0;
  padding: 0;
}

.nutrition > summary {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-height: var(--tap);
  padding: var(--space-3);
  cursor: pointer;
  list-style: none;
}

.nutrition > summary::-webkit-details-marker {
  display: none;
}

/* Een eigen pijltje, dat omdraait als het blok open is. */
.nutrition > summary::after {
  content: '';
  align-self: center;
  width: 0.55rem;
  height: 0.55rem;
  margin-left: auto;
  border-right: 2px solid var(--color-text-muted);
  border-bottom: 2px solid var(--color-text-muted);
  transform: rotate(45deg);
  transition: transform var(--duration) ease;
}

.nutrition[open] > summary::after {
  transform: rotate(-135deg);
}

.nutrition > summary h2 {
  margin: 0;
}

.nutrition > :not(summary) {
  margin-left: var(--space-3);
  margin-right: var(--space-3);
}

table {
  width: calc(100% - 2 * var(--space-3));
  margin-bottom: var(--space-3);
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

th,
td {
  padding: var(--space-1) 0;
  text-align: right;
  border-bottom: 1px solid var(--color-border);
}

th:first-child {
  text-align: left;
}

thead th {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

tbody th {
  font-weight: 600;
}

td {
  padding-left: var(--space-2);
  white-space: nowrap;
}

.notes {
  padding-bottom: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.notes p,
.notes details {
  margin: 0 0 var(--space-2);
}

.notes summary {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--color-text);
}

.notes ul {
  margin: 0;
  padding-left: var(--space-5);
}

.not-counted,
.not-counted > summary {
  color: var(--color-text);
}

.per-ingredient ul {
  padding: 0;
  list-style: none;
}

.per-ingredient li {
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-border);
}

.scope {
  font-style: italic;
}

.row-top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text);
}

.row-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.swapped {
  font-weight: 400;
  color: var(--color-text-muted);
}

.row-amount {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.row-values {
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}

.row-source {
  font-size: var(--text-xs);
}

/* Niet meegeteld: grijs, met de reden en een link om het ingrediënt aan te passen. */
.skipped .row-top,
.skipped .row-name {
  color: var(--color-text-muted);
  font-weight: 400;
}

.row-reason a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  margin-left: var(--space-1);
}

.disclaimer {
  font-style: italic;
}

.link a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
