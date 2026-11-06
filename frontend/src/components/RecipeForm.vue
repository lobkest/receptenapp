<script setup>
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { IconMinus, IconPlus } from '@tabler/icons-vue'
import CategoryPicker from '@/components/CategoryPicker.vue'
import OfflineHint from '@/components/OfflineHint.vue'
import RecipeFormIngredientRow from '@/components/RecipeFormIngredientRow.vue'
import RecipeFormStepRow from '@/components/RecipeFormStepRow.vue'
import SectionCard from '@/components/SectionCard.vue'
import TagPicker from '@/components/TagPicker.vue'
import VariationForm from '@/components/VariationForm.vue'
import { useIngredientNames } from '@/composables/useIngredientNames'
import { errorsUnder, useServerErrors } from '@/composables/useServerErrors'
import { vAutogrow } from '@/directives/autogrow'
import { DEFAULT_UNIT, numberText } from '@/utils/quantity'

// Het receptformulier, voor toevoegen (RecipeNewView) en bewerken (RecipeEditView). Eén
// ingrediëntregel is RecipeFormIngredientRow, één stap RecipeFormStepRow; dit component
// houdt de lijsten bij, bouwt de request en verdeelt de fouten van de server.

// Props: data die de ouder (RecipeNewView of RecipeEditView) naar dit component stuurt.
const props = defineProps({
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  // Geen verbinding (serverStatus.offline): het formulier blijft staan met wat je invulde,
  // maar versturen staat uit.
  offline: { type: Boolean, default: false },
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

// Porties met − en +. Het veld blijft gewone tekst die je ook zelf kunt typen; − en +
// rekenen vanaf het hele getal dat erin staat (leeg of onzin telt als 0). Niet onder 1 en
// niet boven het maximum van de server (Recipe::MAX_SERVINGS); of de waarde geldig is,
// beslist nog steeds de server.
const MAX_SERVINGS = 50

function changeServings(delta) {
  const current = Number.parseInt(form.servings, 10)
  const base = Number.isNaN(current) ? 0 : current
  form.servings = String(Math.min(MAX_SERVINGS, Math.max(1, base + delta)))
}

// De meta rechts in de kop van de kaarten: alleen regels die je echt hebt ingevuld.
const filledIngredientCount = computed(
  () => ingredients.value.filter((row) => row.ingredient_name.trim()).length,
)
const filledStepCount = computed(() => steps.value.filter((step) => !stepIsEmpty(step)).length)

function countLabel(count, one, many) {
  if (!count) return null
  return `${count} ${count === 1 ? one : many}`
}

// Een regel die verdwijnt, staat nog even in beeld (TransitionGroup): niet meer te
// bedienen en niet meer voorgelezen.
function onRowLeave(el) {
  el.inert = true
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
  // Ook Enter in een veld verstuurt het formulier.
  if (props.offline) return
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
const { sortedErrors } = useServerErrors(() => props.errors, {
  skip: (attribute) => FORM_FIELDS.includes(attribute) || attribute.startsWith(VARIATION_PREFIX),
  rowPattern:
    /^(?<list>recipe_ingredients|steps)\[(?<index>\d+)\]\.(?<field>(?:alternatives\[\d+\]\.)?\w+)$/,
  keyOf: ({ list, index }) => sentKeys.value[list][Number(index)],
  labels: labelOf,
})

// Welke velden van een regel de server fout vond, voor de rode rand (aria-invalid). De
// velden van een alternatief heten "alternatives[1].quantity" (zijn plek in de laatst
// verstuurde request); RecipeFormIngredientRow zoekt het goede alternatief daarbij.
function invalidOf(row) {
  return sortedErrors.value.invalid[row.key] ?? {}
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ul v-if="sortedErrors.general.length" class="general-errors notice notice-error" role="alert">
      <li v-for="message in sortedErrors.general" :key="message">{{ message }}</li>
    </ul>

    <!-- De titel groot bovenaan, zonder zichtbaar label: de placeholder zegt wat erin
         moet, aria-label geeft schermlezers de naam. -->
    <div class="field title-field">
      <input
        id="title"
        v-model="form.title"
        type="text"
        class="title-input"
        aria-label="Titel"
        placeholder="Naam van je recept"
        :aria-invalid="!!errors.title"
      />
      <p v-if="errors.title" class="error">Titel {{ errors.title.join(', ') }}</p>
    </div>

    <SectionCard as="section" title="Over dit recept" class="about">
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

      <!-- Porties (een rij: label links, − getal + rechts) met de tags eronder. -->
      <div class="meta-row">
        <div class="servings-row">
          <label for="servings">Porties</label>
          <div class="servings-stepper">
            <button
              type="button"
              class="btn-icon servings-step"
              aria-label="Eén portie minder"
              @click="changeServings(-1)"
            >
              <IconMinus :size="18" aria-hidden="true" />
            </button>
            <!-- inputmode: de telefoon toont een cijfertoetsenbord; pattern laat iOS dat ook doen. -->
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
            <button
              type="button"
              class="btn-icon servings-step"
              aria-label="Eén portie meer"
              @click="changeServings(1)"
            >
              <IconPlus :size="18" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-if="errors.servings" id="servings-error" class="error servings-error">
          Porties {{ errors.servings.join(', ') }}
        </p>

        <fieldset class="tags field">
          <legend>Tags <span class="muted optional-label">(optioneel)</span></legend>
          <TagPicker v-model="tags" :options="availableTags" :reserved="reservedTags" />
          <p v-if="errors.tag_names" class="error">Tags {{ errors.tag_names.join(', ') }}</p>
        </fieldset>
      </div>
    </SectionCard>

    <SectionCard
      title="Ingrediënten"
      class="ingredients"
      :meta="countLabel(filledIngredientCount, 'ingrediënt', 'ingrediënten')"
    >
      <!-- :key="row.key", niet de index: zie de uitleg bij nextKey. TransitionGroup: een
           nieuwe regel schuift in, een weggehaalde fadet weg en de rest schuift op. -->
      <TransitionGroup tag="div" name="row" class="rows" @before-leave="onRowLeave">
        <RecipeFormIngredientRow
          v-for="(row, index) in ingredients"
          :key="row.key"
          v-model:row="ingredients[index]"
          :index="index"
          :removable="ingredients.length > 1"
          :names="ingredientNames"
          :invalid="invalidOf(row)"
          :sent-alternative-keys="sentKeys.alternatives[row.key] ?? []"
          :messages="sortedErrors.byRow[row.key] ?? []"
          @remove="remove('recipe_ingredients', index)"
          @add-alternative="addAlternative(row)"
          @remove-alternative="(altIndex) => removeAlternative(row, altIndex)"
        />
      </TransitionGroup>

      <button type="button" class="add" @click="addIngredient">
        <IconPlus :size="18" aria-hidden="true" />Ingrediënt toevoegen
      </button>
    </SectionCard>

    <SectionCard
      title="Bereiding"
      class="steps"
      :meta="countLabel(filledStepCount, 'stap', 'stappen')"
    >
      <TransitionGroup tag="ol" name="row" class="rows" @before-leave="onRowLeave">
        <RecipeFormStepRow
          v-for="(step, index) in steps"
          :key="step.key"
          v-model:step="steps[index]"
          :index="index"
          :first="index === 0"
          :last="index === steps.length - 1"
          :removable="steps.length > 1"
          :invalid="invalidOf(step)"
          :messages="sortedErrors.byRow[step.key] ?? []"
          @up="move(steps, index, -1)"
          @down="move(steps, index, 1)"
          @remove="remove('steps', index)"
        />
      </TransitionGroup>

      <button type="button" class="add" @click="addStep">
        <IconPlus :size="18" aria-hidden="true" />Stap toevoegen
      </button>
    </SectionCard>

    <SectionCard as="section" title="Variaties" class="variations">
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
        <IconPlus :size="18" aria-hidden="true" />Variatie toevoegen
      </button>
    </SectionCard>

    <!-- Blijft onderaan in beeld zolang je in het formulier bent (sticky), en staat aan
         het eind gewoon op zijn eigen plek, dus er verdwijnt nooit iets onder. -->
    <div class="submit-bar">
      <button type="submit" class="btn-primary btn-block" :disabled="submitting || offline">
        {{ submitting ? 'Versturen…' : submitLabel }}
      </button>
      <OfflineHint v-if="offline" />
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

.field .error {
  margin-top: var(--space-1);
}

fieldset {
  min-width: 0;
  margin: 0 0 var(--space-4);
}

/* De titel: een groot veld bovenaan, in de koppenletter. Wel 16px of meer (iOS). */
.title-field {
  margin-bottom: var(--space-4);
}

.title-input {
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 600;
  border-radius: var(--radius-lg);
}

.title-input::placeholder {
  font-weight: 400;
}

/* Beschrijving: één regel hoog, groeit mee (zie ook vAutogrow voor oudere browsers). */
.description {
  field-sizing: content;
  resize: none;
}

.about .field:last-child {
  margin-bottom: 0;
}

/* Porties: label links, de stepper rechts, op één rij. Daaronder de tags. */
.meta-row .field {
  margin: 0;
}

.servings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.servings-stepper {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* Het getal: smal en gecentreerd, maar nog steeds een veld dat je zelf kunt typen. */
.servings {
  width: 3.25rem;
  padding-left: var(--space-1);
  padding-right: var(--space-1);
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.servings-step {
  color: var(--color-on-brand);
  background: var(--color-brand);
}

/* Alleen met een muis: op een telefoon blijft hover na een tik hangen. */
@media (hover: hover) {
  .servings-step:hover:not(:disabled) {
    color: var(--color-on-brand);
    background: var(--color-brand-strong);
  }
}

.servings-error {
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
}

/* Tags en categorie: een gewone groep velden, geen kaart; legend klein zoals de labels. */
.tags,
.category {
  padding: 0;
  border: 0;
}

/* Eerst de keuzelijst, de gekozen tags eronder. */
.tags :deep(.chips) {
  order: 1;
}

.tags legend,
.category legend {
  float: none;
  margin-bottom: var(--space-1);
  padding: 0;
  font-family: var(--font-body);
  font-size: var(--text-base);
}

.optional-label {
  font-weight: 400;
}

/* De regels: blokken onder elkaar. Bewust marges en geen flex-gap: een regel die
   verdwijnt (position: absolute, zie hieronder) blijft dan op zijn eigen plek staan; in
   een flexbox zou hij naar boven springen. */
.rows {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows > * + * {
  margin-top: var(--space-2);
}

/* Animaties van TransitionGroup (name="row"): Vue zet deze klassen op de regel.
   Nieuw: van onder in beeld schuiven. Weg: vervagen en iets krimpen, uit de flow
   (absolute), zodat de regels eronder via .row-move soepel opschuiven. */
.row-enter-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}

.row-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}

.row-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.row-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

.row-move {
  transition: transform var(--dur) var(--ease-out);
}

.close-variation {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}

/* Toevoegen: een zachtgroene knop over de hele breedte, met een plus-icoon. */
.add {
  width: 100%;
  margin-top: var(--space-2);
  border-radius: var(--radius);
}

.variations .add {
  margin-top: 0;
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

/* Een brede groene pil, ook op brede schermen. */
.submit-bar .btn-primary {
  width: 100%;
  min-height: 2.875rem;
}

/* Breed staat het menu in de header: dan gewoon tegen de onderrand. */
@media (min-width: 40rem) {
  .submit-bar {
    bottom: 0;
  }
}
</style>
