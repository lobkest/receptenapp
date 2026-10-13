<script setup>
import { computed, reactive, ref, watch } from 'vue'

// Props: data die de ouder (RecipeNewView of AdminRecipeEditView) naar dit component stuurt.
const props = defineProps({
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  // Beginwaarden, bijv. een bestaand recept (met ingredients en steps) bij bewerken.
  // Leeg bij insturen.
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Recept insturen' },
})

// Emits: berichten die dit component terugstuurt naar de ouder.
const emit = defineEmits(['submit', 'dirty-change'])

// Bewust geen eetlepels of cups: alleen eenheden die je kunt optellen en schalen.
const UNITS = ['g', 'ml', 'stuks']

// Eenmalig een kopie van de beginwaarden: props zijn alleen-lezen,
// het formulier past alleen zijn eigen kopie aan.
// Geen eigen validatie: de server beslist wat geldig is.
const form = reactive({
  title: props.initial.title ?? '',
  description: props.initial.description ?? '',
  servings: props.initial.servings ?? 4,
})

// Elke regel krijgt bij het aanmaken een eigen, vaste key. Die blijft bij de regel,
// ook als regels erboven verdwijnen of de volgorde verandert (de index doet dat niet).
// Daarnaast heeft een regel die al in de database staat een id; een nieuwe regel niet.
let nextKey = 1

function newIngredient() {
  return { key: nextKey++, id: null, quantity: '', unit: 'g', ingredient_name: '', note: '' }
}

function newStep() {
  return { key: nextKey++, id: null, body: '' }
}

// Van de vorm die de API terugstuurt naar een formulierregel. "Naar smaak" (null)
// wordt een leeg veld; de eenheid krijgt dan de standaardwaarde, de server negeert hem.
function ingredientFrom(row) {
  return {
    key: nextKey++,
    id: row.id,
    quantity: row.quantity ?? '',
    unit: row.unit ?? 'g',
    ingredient_name: row.name,
    note: row.note ?? '',
  }
}

function stepFrom(step) {
  return { key: nextKey++, id: step.id, body: step.body }
}

// Een ouder recept zonder regels begint, net als een nieuw recept, met één lege regel.
const ingredients = ref(
  props.initial.ingredients?.length
    ? props.initial.ingredients.map(ingredientFrom)
    : [newIngredient()],
)
const steps = ref(props.initial.steps?.length ? props.initial.steps.map(stepFrom) : [newStep()])
const lists = { recipe_ingredients: ingredients, steps }

// Ids van bestaande regels die je hebt weggehaald. Die gaan bij versturen mee als
// { id, _destroy: true }, zodat de server ze verwijdert.
const removedIds = reactive({ recipe_ingredients: [], steps: [] })

// Helemaal niets ingevuld? De eenheid telt niet mee, die heeft altijd een standaardwaarde.
function ingredientIsEmpty(row) {
  return row.quantity === '' && !row.ingredient_name.trim() && !row.note.trim()
}

function stepIsEmpty(step) {
  return !step.body.trim()
}

function addIngredient() {
  ingredients.value.push(newIngredient())
}

function addStep() {
  steps.value.push(newStep())
}

// kind: 'recipe_ingredients' of 'steps'.
function remove(kind, index) {
  const [row] = lists[kind].value.splice(index, 1)
  if (row.id) removedIds[kind].push(row.id)
}

// Verplaatst een regel één plek omhoog (-1) of omlaag (+1).
function move(list, index, delta) {
  const [row] = list.splice(index, 1)
  list.splice(index + delta, 0, row)
}

// Alleen bestaande regels sturen hun id mee; zonder id maakt de server een nieuwe regel.
function withId(row, attributes) {
  return row.id ? { id: row.id, ...attributes } : attributes
}

// Bouwt de request-body, plus welke regel (key) op welke plek in de request staat.
// - Lege nieuwe regels zijn "nog niet gebruikt" en gaan niet mee. Half ingevulde en
//   bestaande regels wel: of die geldig zijn, beslist de server.
// - De volgorde is die van het formulier; de server nummert de stappen zelf.
// - Verwijderde regels komen achteraan, zodat de plek van de overige regels in de
//   request (en dus in foutmeldingen als "steps[1].body") niet verschuift.
// - Een lijst zonder één regel gaat niet mee, zodat bewerken van een ouder recept
//   zonder ingrediënten of stappen gewoon kan. Bij insturen meldt de server dan
//   dat ze verplicht zijn.
function buildRequest() {
  const sent = {
    recipe_ingredients: ingredients.value.filter((row) => row.id || !ingredientIsEmpty(row)),
    steps: steps.value.filter((step) => step.id || !stepIsEmpty(step)),
  }
  const attributes = {
    recipe_ingredients: sent.recipe_ingredients.map((row) =>
      withId(row, {
        ingredient_name: row.ingredient_name,
        quantity: row.quantity === '' ? null : row.quantity,
        unit: row.unit,
        note: row.note,
      }),
    ),
    steps: sent.steps.map((step) => withId(step, { body: step.body })),
  }

  const body = { ...form }
  const keys = {}
  for (const kind of ['recipe_ingredients', 'steps']) {
    const removed = removedIds[kind].map((id) => ({ id, _destroy: true }))
    const list = [...attributes[kind], ...removed]
    if (list.length) body[`${kind}_attributes`] = list
    keys[kind] = sent[kind].map((row) => row.key)
  }

  return { body, keys }
}

// Is er iets veranderd ten opzichte van de beginwaarden? We vergelijken de body die we
// nu zouden versturen met die van het begin. Zo telt elke wijziging die de server zou
// zien mee (ook herschikken en verwijderen), en een lege nieuwe regel niet.
const startBody = JSON.stringify(buildRequest().body)
const dirty = computed(() => JSON.stringify(buildRequest().body) !== startBody)
watch(dirty, (value) => emit('dirty-change', value))

// Welke regel (key) zat op welke plek in de laatst verstuurde request. De server meldt
// fouten als "steps[1].body", waarbij 1 de plek in de request is, niet in het formulier:
// lege regels zijn niet meegestuurd en regels kunnen daarna nog verschoven zijn.
const sentKeys = ref({ recipe_ingredients: [], steps: [] })

function onSubmit() {
  const { body, keys } = buildRequest()
  sentKeys.value = keys
  emit('submit', body)
}

const FORM_FIELDS = ['title', 'description', 'servings']
const LABELS = {
  recipe_ingredients: 'Ingrediënten',
  steps: 'Stappen',
  ingredient_name: 'Naam',
  quantity: 'Hoeveelheid',
  unit: 'Eenheid',
  note: 'Notitie',
  body: 'Stap',
}
const ROW_ERROR = /^(recipe_ingredients|steps)\[(\d+)\]\.(\w+)$/

// Verdeelt de serverfouten: per regel (op key) en algemeen (bovenaan het formulier).
const sortedErrors = computed(() => {
  const byRow = {}
  const general = []

  for (const [attribute, messages] of Object.entries(props.errors)) {
    if (FORM_FIELDS.includes(attribute)) continue

    const match = attribute.match(ROW_ERROR)
    const key = match && sentKeys.value[match[1]][Number(match[2])]
    if (key) {
      byRow[key] ??= []
      byRow[key].push(`${LABELS[match[3]] ?? match[3]} ${messages.join(', ')}`)
    } else if (attribute === 'base') {
      general.push(...messages)
    } else {
      general.push(`${LABELS[attribute] ?? attribute} ${messages.join(', ')}`)
    }
  }

  return { byRow, general }
})
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ul v-if="sortedErrors.general.length" class="general-errors" role="alert">
      <li v-for="message in sortedErrors.general" :key="message">{{ message }}</li>
    </ul>

    <div class="field">
      <label for="title">Titel</label>
      <input id="title" v-model="form.title" type="text" :aria-invalid="!!errors.title" />
      <p v-if="errors.title" class="error">Titel {{ errors.title.join(', ') }}</p>
    </div>

    <div class="field">
      <label for="description">Beschrijving</label>
      <textarea
        id="description"
        v-model="form.description"
        rows="6"
        :aria-invalid="!!errors.description"
      ></textarea>
      <p v-if="errors.description" class="error">
        Beschrijving {{ errors.description.join(', ') }}
      </p>
    </div>

    <div class="field">
      <label for="servings">Porties</label>
      <input
        id="servings"
        v-model.number="form.servings"
        type="number"
        :aria-invalid="!!errors.servings"
      />
      <p v-if="errors.servings" class="error">Porties {{ errors.servings.join(', ') }}</p>
    </div>

    <fieldset class="ingredients">
      <legend>Ingrediënten</legend>
      <p class="hint">Laat de hoeveelheid leeg voor "naar smaak".</p>

      <!-- :key="row.key", niet de index: zie de uitleg bij nextKey. -->
      <div
        v-for="(row, index) in ingredients"
        :key="row.key"
        class="row ingredient-row"
        :data-key="row.key"
      >
        <div class="inputs">
          <input
            v-model="row.quantity"
            type="number"
            step="any"
            min="0"
            class="quantity"
            :aria-label="`Hoeveelheid ingrediënt ${index + 1}`"
          />
          <select v-model="row.unit" class="unit" :aria-label="`Eenheid ingrediënt ${index + 1}`">
            <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
          </select>
          <input
            v-model="row.ingredient_name"
            type="text"
            class="name"
            placeholder="bijv. bloem"
            :aria-label="`Naam ingrediënt ${index + 1}`"
          />
          <input
            v-model="row.note"
            type="text"
            class="note"
            placeholder="notitie, bijv. fijngesneden"
            :aria-label="`Notitie ingrediënt ${index + 1}`"
          />
          <button
            type="button"
            class="remove"
            :disabled="ingredients.length === 1"
            @click="remove('recipe_ingredients', index)"
          >
            verwijderen
          </button>
        </div>
        <p v-for="message in sortedErrors.byRow[row.key]" :key="message" class="error">
          {{ message }}
        </p>
      </div>

      <button type="button" class="add" @click="addIngredient">+ ingrediënt</button>
    </fieldset>

    <fieldset class="steps">
      <legend>Bereiding</legend>

      <ol>
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          class="row step-row"
          :data-key="step.key"
        >
          <label :for="`step-${step.key}`">Stap {{ index + 1 }}</label>
          <textarea :id="`step-${step.key}`" v-model="step.body" rows="3"></textarea>
          <div class="step-actions">
            <button
              type="button"
              class="up"
              :disabled="index === 0"
              :aria-label="`Stap ${index + 1} omhoog`"
              @click="move(steps, index, -1)"
            >
              ↑ omhoog
            </button>
            <button
              type="button"
              class="down"
              :disabled="index === steps.length - 1"
              :aria-label="`Stap ${index + 1} omlaag`"
              @click="move(steps, index, 1)"
            >
              ↓ omlaag
            </button>
            <button
              type="button"
              class="remove"
              :disabled="steps.length === 1"
              @click="remove('steps', index)"
            >
              verwijderen
            </button>
          </div>
          <p v-for="message in sortedErrors.byRow[step.key]" :key="message" class="error">
            {{ message }}
          </p>
        </li>
      </ol>

      <button type="button" class="add" @click="addStep">+ stap</button>
    </fieldset>

    <button type="submit" :disabled="submitting">
      {{ submitting ? 'Versturen…' : submitLabel }}
    </button>
  </form>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

input,
select,
textarea {
  font: inherit;
  padding: 0.5rem;
  border: 1px solid #bbb;
  border-radius: 4px;
  width: 100%;
}

input[aria-invalid='true'],
textarea[aria-invalid='true'] {
  border-color: #c00;
}

.error {
  color: #c00;
  margin: 0;
  font-size: 0.9rem;
}

.general-errors {
  padding: 0.75rem 0.75rem 0.75rem 2rem;
  background: #fdecea;
  color: #900;
  border-radius: 4px;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
}

fieldset {
  border: 1px solid #ddd;
  border-radius: 4px;
  margin: 0 0 1rem;
  padding: 0.75rem;
}

.hint {
  margin: 0 0 0.5rem;
  color: #666;
  font-size: 0.9rem;
}

.row {
  margin-bottom: 0.75rem;
}

.inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.quantity {
  flex: 0 0 6rem;
}

.unit {
  flex: 0 0 6rem;
}

.name {
  flex: 1 1 10rem;
}

.note {
  flex: 1 1 10rem;
}

.inputs .remove {
  flex: 0 0 auto;
}

.steps ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

.step-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.step-actions button,
.inputs button,
.add {
  padding: 0.25rem 0.75rem;
}
</style>
