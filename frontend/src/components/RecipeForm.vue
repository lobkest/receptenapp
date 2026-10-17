<script setup>
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import CategoryPicker from '@/components/CategoryPicker.vue'
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import TagPicker from '@/components/TagPicker.vue'
import VariationForm from '@/components/VariationForm.vue'
import { useIngredientNames } from '@/composables/useIngredientNames'
import { errorsUnder, useServerErrors } from '@/composables/useServerErrors'
import { DEFAULT_UNIT, numberText, UNITS } from '@/utils/quantity'

// Props: data die de ouder (RecipeNewView of RecipeEditView) naar dit component stuurt.
const props = defineProps({
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  // Beginwaarden, bijv. een bestaand recept (met ingredients en steps) bij bewerken.
  // Leeg bij toevoegen.
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Recept toevoegen' },
  // Bestaande tags om uit te kiezen (namen, uit /api/tags).
  availableTags: { type: Array, default: () => [] },
  // Automatische tags (vegetarisch): die volgen uit de ingrediënten, niet te kiezen.
  reservedTags: { type: Array, default: () => [] },
  // Bestaande categorieën om uit te kiezen, op volgorde: [{ id, name, position }].
  availableCategories: { type: Array, default: () => [] },
})

// Emits: berichten die dit component terugstuurt naar de ouder.
const emit = defineEmits(['submit', 'dirty-change'])

// Bestaande ingrediënten, voor "Bedoel je: …?" onder een nieuwe naam.
const ingredientNames = useIngredientNames()

// Eenmalig een kopie van de beginwaarden: props zijn alleen-lezen,
// het formulier past alleen zijn eigen kopie aan.
// Geen eigen validatie: de server beslist wat geldig is. (Eén uitzondering: een lege
// nieuwe categorie, zie onSubmit.)
const form = reactive({
  title: props.initial.title ?? '',
  description: props.initial.description ?? '',
  servings: numberText(props.initial.servings ?? 4),
})

// Elke regel krijgt bij het aanmaken een eigen, vaste key. Die blijft bij de regel,
// ook als regels erboven verdwijnen of de volgorde verandert (de index doet dat niet).
// Daarnaast heeft een regel die al in de database staat een id; een nieuwe regel niet.
let nextKey = 1

function newIngredient() {
  return {
    key: nextKey++,
    id: null,
    quantity: '',
    unit: DEFAULT_UNIT,
    ingredient_name: '',
    optional: false,
    alternatives: [],
    removedAlternativeIds: [],
  }
}

// Een alternatief ("of: tofu"). Zonder hoeveelheid geldt die van het origineel; de
// eenheid begint bij die van het origineel, zodat je alleen het getal hoeft te typen.
function newAlternative(row) {
  return { key: nextKey++, id: null, ingredient_name: '', quantity: '', unit: row.unit }
}

function alternativeFrom(alternative, row) {
  return {
    key: nextKey++,
    id: alternative.id,
    ingredient_name: alternative.name,
    quantity: numberText(alternative.quantity),
    unit: alternative.unit ?? row.unit ?? DEFAULT_UNIT,
  }
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
    quantity: numberText(row.quantity),
    unit: row.unit ?? DEFAULT_UNIT,
    ingredient_name: row.name,
    optional: row.optional ?? false,
    alternatives: (row.alternatives ?? []).map((alternative) => alternativeFrom(alternative, row)),
    // Weggehaalde bestaande alternatieven: die gaan mee als { id, _destroy: true }.
    removedAlternativeIds: [],
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
// Bij bewerken staan de bestaande tags al gekozen.
const tags = ref([...(props.initial.tags ?? [])])
const lists = { recipe_ingredients: ingredients, steps }

// De naam van de categorie ('' = geen); kiezen gebeurt in CategoryPicker.
const category = ref(props.initial.category?.name ?? '')
const categoryPicker = useTemplateRef('categoryPicker')

// Een nieuwe variatie, opgeslagen samen met het recept. Standaard ingeklapt: de meeste
// recepten krijgen er geen bij het invullen. Bestaande variaties bewerk je op de receptpagina.
const variationOpen = ref(false)
const variationForm = useTemplateRef('variationForm')

// "−" kan alleen bij regels die al opgeslagen zijn (met id) en die je niet net weghaalt;
// bij een nieuw recept zijn dat er nog geen, en toont VariationForm een korte uitleg.
const savedIngredients = computed(() =>
  ingredients.value
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      name: row.ingredient_name,
      quantity: row.quantity.trim() ? row.quantity : null,
      unit: row.unit,
    })),
)

// Ids van bestaande regels die je hebt weggehaald. Die gaan bij versturen mee als
// { id, _destroy: true }, zodat de server ze verwijdert.
const removedIds = reactive({ recipe_ingredients: [], steps: [] })

// Helemaal niets ingevuld? De eenheid en het vinkje tellen niet mee, die hebben altijd
// een standaardwaarde.
function ingredientIsEmpty(row) {
  return !row.quantity.trim() && !row.ingredient_name.trim()
}

function stepIsEmpty(step) {
  return !step.body.trim()
}

function alternativeIsEmpty(alternative) {
  return !alternative.quantity.trim() && !alternative.ingredient_name.trim()
}

function addAlternative(row) {
  row.alternatives.push(newAlternative(row))
}

function removeAlternative(row, index) {
  const [alternative] = row.alternatives.splice(index, 1)
  if (alternative.id) row.removedAlternativeIds.push(alternative.id)
}

// Net als bij de regels: lege nieuwe alternatieven gaan niet mee, weggehaalde bestaande
// achteraan. Zonder alternatieven gaat de sleutel helemaal niet mee.
function alternativesRequest(row) {
  const sent = row.alternatives.filter(
    (alternative) => alternative.id || !alternativeIsEmpty(alternative),
  )
  const list = [
    ...sent.map((alternative) =>
      withId(alternative, {
        ingredient_name: alternative.ingredient_name,
        quantity: alternative.quantity.trim() || null,
        unit: alternative.unit,
      }),
    ),
    ...row.removedAlternativeIds.map((id) => ({ id, _destroy: true })),
  ]
  return { list, keys: sent.map((alternative) => alternative.key) }
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
//   zonder ingrediënten of stappen gewoon kan. Bij toevoegen meldt de server dan
//   dat ze verplicht zijn.
function buildRequest() {
  const sent = {
    recipe_ingredients: ingredients.value.filter((row) => row.id || !ingredientIsEmpty(row)),
    steps: steps.value.filter((step) => step.id || !stepIsEmpty(step)),
  }
  const alternativeKeys = {}
  const attributes = {
    recipe_ingredients: sent.recipe_ingredients.map((row) => {
      const alternatives = alternativesRequest(row)
      alternativeKeys[row.key] = alternatives.keys
      return withId(row, {
        ingredient_name: row.ingredient_name,
        quantity: row.quantity.trim() || null,
        unit: row.unit,
        optional: row.optional,
        ...(alternatives.list.length ? { alternatives_attributes: alternatives.list } : {}),
      })
    }),
    steps: sent.steps.map((step) => withId(step, { body: step.body })),
  }

  // tag_names en category_name gaan altijd mee: leeg betekent "geen (meer)".
  const body = {
    ...form,
    servings: form.servings.trim(),
    category_name: category.value,
    tag_names: [...tags.value],
  }
  if (variationOpen.value && variationForm.value) {
    body.variations_attributes = [variationForm.value.buildRequest().body]
  }
  const keys = { alternatives: alternativeKeys }
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
// alternatives: per regel (key) de keys van de meegestuurde alternatieven, voor
// "recipe_ingredients[0].alternatives[1].quantity".
const sentKeys = ref({ recipe_ingredients: [], steps: [], alternatives: {} })

function onSubmit() {
  // "Nieuwe categorie…" zonder naam zou stilletjes "geen categorie" worden.
  if (categoryPicker.value && !categoryPicker.value.validate()) return

  const { body, keys } = buildRequest()
  sentKeys.value = keys
  if (body.variations_attributes) body.variations_attributes = [variationForm.value.submitted()]
  emit('submit', body)
}

const FORM_FIELDS = ['title', 'description', 'servings', 'tag_names', 'category_name']
const VARIATION_PREFIX = 'variations[0].'

// De fouten van de variatie ("variations[0].name") gaan, zonder dat voorvoegsel, naar
// het variatieformulier zelf.
const variationErrors = computed(() => errorsUnder(props.errors, VARIATION_PREFIX))

const LABELS = {
  recipe_ingredients: 'Ingrediënten',
  steps: 'Stappen',
  variations: 'Variaties',
  alternatives: 'Alternatieven',
  ingredient_name: 'Naam',
  quantity: 'Hoeveelheid',
  unit: 'Eenheid',
  body: 'Stap',
}

// "alternatives[1].quantity" wordt "Alternatief 2: hoeveelheid".
function labelOf(field) {
  const match = field.match(/^alternatives\[(\d+)\]\.(\w+)$/)
  if (!match) return LABELS[field]

  return `Alternatief ${Number(match[1]) + 1}: ${(LABELS[match[2]] ?? match[2]).toLowerCase()}`
}

// De overige serverfouten: per regel (op key) en algemeen (bovenaan het formulier). Een
// fout van een alternatief hoort bij zijn ingrediëntregel.
const { sortedErrors, isInvalid } = useServerErrors(() => props.errors, {
  skip: (attribute) => FORM_FIELDS.includes(attribute) || attribute.startsWith(VARIATION_PREFIX),
  rowPattern:
    /^(?<list>recipe_ingredients|steps)\[(?<index>\d+)\]\.(?<field>(?:alternatives\[\d+\]\.)?\w+)$/,
  keyOf: ({ list, index }) => sentKeys.value[list][Number(index)],
  labels: labelOf,
})

// Het veld van een alternatief rood maken: zijn plek in de laatst verstuurde request.
function isAlternativeInvalid(row, alternative, field) {
  const index = sentKeys.value.alternatives[row.key]?.indexOf(alternative.key) ?? -1
  return index >= 0 && isInvalid(row, `alternatives[${index}].${field}`)
}

// Stappen groeien mee met de tekst. CSS doet dat met field-sizing: content; browsers
// die dat (nog) niet kennen, krijgen de hoogte hier: eerst 'auto' zodat hij ook kan
// krimpen, dan de hoogte van de inhoud plus de rand. Vanaf 2 regels (rows="2").
const fieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

function grow(textarea) {
  textarea.style.height = 'auto'
  const border = textarea.offsetHeight - textarea.clientHeight
  if (textarea.scrollHeight) textarea.style.height = `${textarea.scrollHeight + border}px`
}

// Een eigen directive (v-autogrow): Vue roept hem aan als de textarea op het scherm komt
// en na elke wijziging, ook van v-model.
const vAutogrow = fieldSizing ? {} : { mounted: grow, updated: grow }
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ul v-if="sortedErrors.general.length" class="general-errors notice notice-error" role="alert">
      <li v-for="message in sortedErrors.general" :key="message">{{ message }}</li>
    </ul>

    <div class="field">
      <label for="title">Titel</label>
      <input id="title" v-model="form.title" type="text" :aria-invalid="!!errors.title" />
      <p v-if="errors.title" class="error">Titel {{ errors.title.join(', ') }}</p>
    </div>

    <div class="field">
      <label for="description">Beschrijving</label>
      <!-- Begint op één regel en groeit mee met de tekst, net als de stappen. -->
      <textarea
        id="description"
        v-model="form.description"
        v-autogrow
        rows="1"
        class="description"
        :aria-invalid="!!errors.description"
      ></textarea>
      <p v-if="errors.description" class="error">
        Beschrijving {{ errors.description.join(', ') }}
      </p>
    </div>

    <fieldset class="category field">
      <legend>Categorie <span class="muted optional-label">(optioneel)</span></legend>
      <CategoryPicker
        ref="categoryPicker"
        v-model="category"
        :options="availableCategories"
        :error="errors.category_name ? `Categorie ${errors.category_name.join(', ')}` : null"
      />
    </fieldset>

    <!-- Porties (smal) en tags naast elkaar op één rij. -->
    <div class="meta-row">
      <!-- inputmode: de telefoon toont een cijfertoetsenbord; pattern laat iOS dat ook doen. -->
      <div class="field">
        <label for="servings">Porties</label>
        <input
          id="servings"
          v-model="form.servings"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          class="servings"
          :aria-invalid="!!errors.servings"
          :aria-describedby="errors.servings ? 'servings-error' : undefined"
        />
      </div>

      <fieldset class="tags field">
        <legend>Tags <span class="muted optional-label">(optioneel)</span></legend>
        <TagPicker v-model="tags" :options="availableTags" :reserved="reservedTags" />
        <p v-if="errors.tag_names" class="error">Tags {{ errors.tag_names.join(', ') }}</p>
      </fieldset>
      <!-- Onder porties en tags, over de hele breedte: in de smalle portieskolom zou de
           melding over zes regels breken. -->
      <p v-if="errors.servings" id="servings-error" class="error servings-error">
        Porties {{ errors.servings.join(', ') }}
      </p>
    </div>

    <fieldset class="ingredients card">
      <legend>Ingrediënten</legend>

      <!-- :key="row.key", niet de index: zie de uitleg bij nextKey. -->
      <div
        v-for="(row, index) in ingredients"
        :key="row.key"
        class="row ingredient-row"
        :data-key="row.key"
      >
        <div class="inputs">
          <input
            v-model="row.ingredient_name"
            type="text"
            class="name"
            placeholder="bijv. bloem"
            :aria-label="`Naam ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'ingredient_name')"
          />
          <input
            v-model="row.quantity"
            type="text"
            inputmode="decimal"
            class="quantity"
            :aria-label="`Hoeveelheid ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'quantity')"
          />
          <select
            v-model="row.unit"
            class="unit"
            :aria-label="`Eenheid ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'unit')"
          >
            <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
          </select>
          <!-- Het hele label is het tikvlak (min. --tap×--tap), niet alleen het vakje. -->
          <label class="optional">
            <input v-model="row.optional" type="checkbox" />
            optioneel
          </label>
          <button
            type="button"
            class="remove btn-danger"
            :disabled="ingredients.length === 1"
            :aria-label="`Ingrediënt ${index + 1} verwijderen`"
            @click="remove('recipe_ingredients', index)"
          >
            ×
          </button>
        </div>
        <IngredientSuggestion
          :name="row.ingredient_name"
          :names="ingredientNames"
          @use="row.ingredient_name = $event"
        />
        <!-- Alternatieven ("of: tofu"): ingeklapt achter "+ alternatief". -->
        <div
          v-for="(alternative, altIndex) in row.alternatives"
          :key="alternative.key"
          class="alternative"
          :data-key="alternative.key"
        >
          <span class="of" aria-hidden="true">of</span>
          <input
            v-model="alternative.ingredient_name"
            type="text"
            class="alt-name"
            placeholder="bijv. tofu"
            :aria-label="`Alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
            :aria-invalid="isAlternativeInvalid(row, alternative, 'ingredient_name')"
          />
          <input
            v-model="alternative.quantity"
            type="text"
            inputmode="decimal"
            class="alt-quantity"
            placeholder="zelfde als origineel"
            :aria-label="`Hoeveelheid alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
            :aria-invalid="isAlternativeInvalid(row, alternative, 'quantity')"
          />
          <!-- Zonder hoeveelheid geldt die van het origineel, en telt de eenheid niet. -->
          <select
            v-model="alternative.unit"
            class="alt-unit"
            :disabled="!alternative.quantity.trim()"
            :aria-label="`Eenheid alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
            :aria-invalid="isAlternativeInvalid(row, alternative, 'unit')"
          >
            <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
          </select>
          <button
            type="button"
            class="alt-remove"
            :aria-label="`Alternatief ${altIndex + 1} voor ingrediënt ${index + 1} verwijderen`"
            @click="removeAlternative(row, altIndex)"
          >
            ×
          </button>
          <!-- Dezelfde "Bedoel je: …?" als bij de naam van het ingrediënt. -->
          <IngredientSuggestion
            class="alt-suggestion"
            :name="alternative.ingredient_name"
            :names="ingredientNames"
            @use="alternative.ingredient_name = $event"
          />
        </div>
        <button
          type="button"
          class="add-alternative"
          :aria-label="`Alternatief voor ingrediënt ${index + 1} toevoegen`"
          @click="addAlternative(row)"
        >
          + alternatief
        </button>
        <p v-for="message in sortedErrors.byRow[row.key]" :key="message" class="error">
          {{ message }}
        </p>
      </div>

      <button type="button" class="add" @click="addIngredient">+ ingrediënt</button>
    </fieldset>

    <fieldset class="steps card">
      <legend>Bereiding</legend>

      <ol>
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          class="row step-row"
          :data-key="step.key"
        >
          <label :for="`step-${step.key}`">Stap {{ index + 1 }}</label>
          <textarea
            :id="`step-${step.key}`"
            v-model="step.body"
            v-autogrow
            rows="2"
            :aria-invalid="isInvalid(step, 'body')"
          ></textarea>
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
              class="remove btn-danger"
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

    <section class="variations card">
      <h2>Variaties</h2>
      <template v-if="variationOpen">
        <VariationForm
          ref="variationForm"
          embedded
          :base-ingredients="savedIngredients"
          :base-tags="tags"
          :available-tags="availableTags"
          :reserved-tags="reservedTags"
          :errors="variationErrors"
        />
        <button type="button" class="close-variation" @click="variationOpen = false">
          Variatie weghalen
        </button>
      </template>
      <button v-else type="button" class="add" @click="variationOpen = true">
        + Variatie toevoegen
      </button>
    </section>

    <!-- Blijft onderaan in beeld zolang je in het formulier bent (sticky), en staat aan
         het eind gewoon op zijn eigen plek, dus er verdwijnt nooit iets onder. -->
    <div class="submit-bar">
      <button type="submit" class="btn-primary btn-block" :disabled="submitting">
        {{ submitting ? 'Versturen…' : submitLabel }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.general-errors {
  padding-left: var(--space-6);
}

.general-errors li + li {
  margin-top: var(--space-1);
}

.field .error,
.row .error {
  margin-top: var(--space-1);
}

fieldset {
  min-width: 0;
  margin: 0 0 var(--space-4);
}

legend {
  float: left;
  width: 100%;
  margin-bottom: var(--space-2);
  padding: 0;
  font-family: var(--font-heading);
  font-size: var(--text-xl);
}

/* clear: onder de legend, die float: left heeft (anders botst de eerste regel ermee). */
.row {
  clear: both;
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border);
}

.row:last-child {
  border-bottom: 0;
}

/* Beschrijving: één regel hoog, groeit mee (zie ook vAutogrow voor oudere browsers). */
.description {
  field-sizing: content;
  resize: none;
}

/* Porties smal links, tags in de rest van de breedte. Beide labels staan bovenaan,
   zodat het portieveld en de tag-keuzelijst op dezelfde hoogte beginnen. */
.meta-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  margin-bottom: var(--space-3);
}

.meta-row .field {
  margin: 0;
}

.servings-error {
  grid-column: 1 / -1;
  margin: 0;
}

/* Tags: een gewoon veld, geen kaart; legend klein zoals de andere labels. */
.tags {
  padding: 0;
  border: 0;
}

/* Eerst de keuzelijst (naast porties), de gekozen tags eronder. */
.tags :deep(.chips) {
  order: 1;
}

.tags legend {
  float: none;
  margin-bottom: var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-base);
}

.optional-label {
  font-weight: 400;
}

/* Categorie: een gewoon veld zoals de tags, geen kaart. */
.category {
  padding: 0;
  border: 0;
}

.category legend {
  float: none;
  margin-bottom: var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-base);
}

/* Mobiel: de naam over de hele breedte; daaronder hoeveelheid, eenheid, optioneel en ×. */
.inputs {
  display: grid;
  /* De eenheid minstens zo breed dat "stuks" helemaal zichtbaar is. */
  grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 1fr) auto auto;
  gap: var(--space-2);
  align-items: center;
}

.inputs .name {
  grid-column: 1 / -1;
}

/* Mogen smaller worden dan hun standaardbreedte, anders past de rij niet op 390 px. */
.inputs .quantity,
.inputs .unit {
  min-width: 0;
}

.inputs .unit {
  padding-right: var(--space-1);
}

.optional {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 var(--space-1);
  font-size: var(--text-sm);
  font-weight: 400;
  cursor: pointer;
}

.inputs .remove {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  line-height: 1;
}

/* Breed: alles op één regel. */
@media (min-width: 40rem) {
  .inputs {
    grid-template-columns: 1fr 6rem 6rem auto auto;
  }

  .inputs .name {
    grid-column: auto;
  }
}

/* Een alternatief: ingesprongen onder zijn ingrediënt, met "of" ervoor. Mobiel de naam
   (en ×) op de eerste regel, hoeveelheid en eenheid eronder. */
.alternative {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 5.5rem var(--tap);
  gap: var(--space-1) var(--space-2);
  align-items: center;
  margin-top: var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--color-brand-soft);
}

.alternative .of {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.alternative .alt-name {
  grid-column: 2 / 4;
}

.alternative .alt-quantity {
  grid-column: 2;
}

.alternative .alt-quantity,
.alternative .alt-unit {
  min-width: 0;
}

.alternative .alt-quantity::placeholder {
  font-size: var(--text-sm);
}

.alternative .alt-unit {
  padding-right: var(--space-1);
}

.alternative .alt-unit:disabled {
  opacity: 0.5;
}

.alternative .alt-suggestion {
  grid-column: 2 / -1;
  margin: 0;
}

.alternative .alt-remove {
  grid-row: 1;
  grid-column: 4;
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  line-height: 1;
  color: var(--color-text-muted);
}

/* Klein en licht: de meeste ingrediënten hebben geen alternatief. Wel een volledig
   tikvlak (--tap hoog), zoals elke knop. */
.add-alternative {
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  background: transparent;
  border: 0;
}

@media (min-width: 40rem) {
  .alternative {
    grid-template-columns: auto minmax(0, 1fr) 10rem 6rem var(--tap);
  }

  .alternative .alt-name,
  .alternative .alt-quantity {
    grid-column: auto;
  }

  .alternative .alt-remove {
    grid-row: auto;
    grid-column: auto;
  }
}

.steps ol {
  clear: both;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Groeit mee met de tekst, vanaf 2 regels (zie ook vAutogrow voor oudere browsers). */
.step-row textarea {
  field-sizing: content;
  min-height: calc(2lh + 2 * var(--control-pad-y) + 2px);
  resize: none;
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.step-actions .remove {
  margin-left: auto;
}

.step-actions button {
  font-size: var(--text-sm);
}

.variations {
  margin-bottom: var(--space-4);
}

.variations h2 {
  font-size: var(--text-xl);
}

.close-variation {
  font-size: var(--text-sm);
}

/* Toevoegen: een gestippelde knop over de hele breedte, als een lege regel. */
.add {
  width: 100%;
  margin-top: var(--space-2);
  color: var(--color-accent-text);
  border-style: dashed;
}

/* Opslaan blijft in beeld: sticky boven de vaste menubalk (en de thuisbalk van de
   iPhone). De achtergrond loopt door tot de rand, zodat de inhoud er netjes onder
   wegschuift. De negatieve marge heft de zijmarge van <main> op. */
.submit-bar {
  position: sticky;
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom));
  z-index: 5;
  margin: 0 calc(-1 * var(--space-4));
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

/* Breed staat het menu in de header: dan gewoon tegen de onderrand. */
@media (min-width: 40rem) {
  .submit-bar {
    bottom: 0;
  }
}
</style>
