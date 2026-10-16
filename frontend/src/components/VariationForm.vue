<script setup>
import { computed, reactive, ref, useId } from 'vue'
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import TagPicker from '@/components/TagPicker.vue'
import { useIngredientNames } from '@/composables/useIngredientNames'
import { useServerErrors } from '@/composables/useServerErrors'
import { formatQuantity, numberText, UNITS } from '@/utils/quantity'

// Een variatie toevoegen of bewerken: naam, notities, ingrediënten eraf (uit het
// basisrecept) en erbij, en tags erbij of eraf.
//
// Twee manieren van gebruiken:
// - los (receptpagina): een eigen <form> met Opslaan en Annuleren; emit 'submit' met de body.
// - embedded (in RecipeForm): geen eigen <form>, want formulieren mogen niet in elkaar.
//   De ouder haalt de body op met de functies uit defineExpose.
const props = defineProps({
  // Een bestaande variatie zoals de API hem stuurt, of leeg bij toevoegen.
  initial: { type: Object, default: () => ({}) },
  // De ingrediënten van het basisrecept: [{ id, name, quantity, unit }]. Zonder id (nog
  // niet opgeslagen) kun je ze niet weglaten.
  baseIngredients: { type: Array, default: () => [] },
  // De tags van het basisrecept (namen); alleen die kunnen eraf.
  baseTags: { type: Array, default: () => [] },
  // Alle bestaande tags (namen), om er een bij te kiezen.
  availableTags: { type: Array, default: () => [] },
  // Automatische tags (vegetarisch): die rekent de server per variatie uit.
  reservedTags: { type: Array, default: () => [] },
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Variatie opslaan' },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'cancel'])

// Bestaande ingrediënten, voor "Bedoel je: …?" onder een extra ingrediënt.
const ingredientNames = useIngredientNames()

const uid = useId()

const changes = props.initial.changes ?? []
// Alleen de tags die iemand zelf koos; de automatische (automatic: true) zijn uitgerekend.
const tagChanges = (props.initial.tag_changes ?? []).filter((change) => !change.automatic)

const form = reactive({
  name: props.initial.name ?? '',
  notes: props.initial.notes ?? '',
})

// Ids van de regels uit het basisrecept die eraf gaan.
const removedIds = ref(
  changes.filter((change) => change.kind === 'remove').map((change) => change.recipe_ingredient_id),
)

// Extra ingrediënten, met een eigen vaste key per regel (zie RecipeForm).
let nextKey = 1

function newAddition() {
  return { key: nextKey++, name: '', quantity: '', unit: 'stuks' }
}

const additions = ref(
  changes
    .filter((change) => change.kind === 'add')
    .map((change) => ({
      key: nextKey++,
      name: change.name,
      quantity: numberText(change.quantity),
      unit: change.unit ?? 'stuks',
    })),
)
if (additions.value.length === 0) additions.value.push(newAddition())

const addedTags = ref(tagChanges.filter((c) => c.kind === 'add').map((c) => c.tag))
const removedTags = ref(tagChanges.filter((c) => c.kind === 'remove').map((c) => c.tag))

// Alleen opgeslagen regels kun je weglaten: die hebben een id.
const removable = computed(() => props.baseIngredients.filter((row) => row.id))
// Een tag die het recept al heeft, kan er niet bij.
const tagOptions = computed(() =>
  props.availableTags.filter((tag) => !props.baseTags.includes(tag)),
)

function addAddition() {
  additions.value.push(newAddition())
}

function removeAddition(index) {
  additions.value.splice(index, 1)
  if (additions.value.length === 0) additions.value.push(newAddition())
}

function additionIsEmpty(row) {
  return !row.name.trim() && !row.quantity.trim()
}

// De body voor de API, plus welke regel (key) op welke plek in added_ingredients staat:
// de server meldt fouten als "additions[1].quantity". Lege regels gaan niet mee. Weglaten
// en tags eraf alleen voor wat het recept (nog) heeft.
function buildRequest() {
  const sent = additions.value.filter((row) => !additionIsEmpty(row))
  const removableIds = removable.value.map((row) => row.id)
  return {
    body: {
      name: form.name,
      notes: form.notes,
      removed_ingredient_ids: removedIds.value.filter((id) => removableIds.includes(id)),
      added_ingredients: sent.map((row) => ({
        name: row.name,
        quantity: row.quantity.trim() || null,
        unit: row.unit,
      })),
      added_tag_names: [...addedTags.value],
      removed_tag_names: removedTags.value.filter((tag) => props.baseTags.includes(tag)),
    },
    keys: sent.map((row) => row.key),
  }
}

const sentKeys = ref([])

// Onthoudt de plekken van de verstuurde regels en geeft de body terug.
function submitted() {
  const { body, keys } = buildRequest()
  sentKeys.value = keys
  return body
}

function onSubmit() {
  emit('submit', submitted())
}

defineExpose({ buildRequest, submitted })

const OWN_FIELDS = ['name', 'notes', 'added_tag_names', 'removed_tag_names']

// Fouten per extra regel (op key) en algemeen (bovenaan).
const { sortedErrors, isInvalid } = useServerErrors(() => props.errors, {
  skip: (attribute) => OWN_FIELDS.includes(attribute),
  rowPattern: /^additions\[(?<index>\d+)\]\.(?<field>\w+)$/,
  keyOf: ({ index }) => sentKeys.value[Number(index)],
  labels: {
    name: 'Naam',
    quantity: 'Hoeveelheid',
    unit: 'Eenheid',
    additions: 'Extra ingrediënten',
    'removals.recipe_ingredient': 'Weggelaten ingrediënt',
    'removals.recipe_ingredient_id': 'Weggelaten ingrediënt',
    lock_version: 'Versie',
  },
})

// "250 g"; zonder hoeveelheid niets.
function amount(row) {
  return row.quantity == null ? '' : `${formatQuantity(row.quantity)} ${row.unit}`
}
</script>

<template>
  <component
    :is="embedded ? 'div' : 'form'"
    class="variation-form"
    :class="{ card: !embedded }"
    @submit.prevent="onSubmit"
  >
    <ul v-if="sortedErrors.general.length" class="notice notice-error general-errors" role="alert">
      <li v-for="message in sortedErrors.general" :key="message">{{ message }}</li>
    </ul>

    <div class="field">
      <label :for="`${uid}-name`">Naam variatie</label>
      <input
        :id="`${uid}-name`"
        v-model="form.name"
        type="text"
        maxlength="60"
        placeholder="bijv. met kip"
        :aria-invalid="!!errors.name"
      />
      <p v-if="errors.name" class="error">Naam {{ errors.name.join(', ') }}</p>
    </div>

    <div class="field">
      <label :for="`${uid}-notes`">Notities <span class="muted light">(optioneel)</span></label>
      <textarea :id="`${uid}-notes`" v-model="form.notes" rows="2" class="notes"></textarea>
      <p v-if="errors.notes" class="error">Notities {{ errors.notes.join(', ') }}</p>
    </div>

    <fieldset class="group">
      <legend>− ingrediënt</legend>
      <p v-if="removable.length === 0" class="hint muted">
        Ingrediënten weglaten kan pas als het recept is opgeslagen.
      </p>
      <ul v-else class="checks">
        <li v-for="row in removable" :key="row.id">
          <label class="check">
            <input v-model="removedIds" type="checkbox" :value="row.id" />
            <span>
              {{ row.name }}
              <span v-if="amount(row)" class="muted light">{{ amount(row) }}</span>
            </span>
          </label>
        </li>
      </ul>
    </fieldset>

    <fieldset class="group">
      <legend>+ ingrediënt</legend>
      <div v-for="(row, index) in additions" :key="row.key" class="addition-row">
        <div class="inputs">
          <input
            v-model="row.name"
            type="text"
            class="name"
            placeholder="bijv. kip"
            :aria-label="`Naam extra ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'name')"
          />
          <input
            v-model="row.quantity"
            type="text"
            inputmode="decimal"
            class="quantity"
            :aria-label="`Hoeveelheid extra ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'quantity')"
          />
          <select
            v-model="row.unit"
            class="unit"
            :aria-label="`Eenheid extra ingrediënt ${index + 1}`"
            :aria-invalid="isInvalid(row, 'unit')"
          >
            <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
          </select>
          <button
            type="button"
            class="remove btn-danger"
            :aria-label="`Extra ingrediënt ${index + 1} verwijderen`"
            @click="removeAddition(index)"
          >
            ×
          </button>
        </div>
        <IngredientSuggestion :name="row.name" :names="ingredientNames" @use="row.name = $event" />
        <p v-for="message in sortedErrors.byRow[row.key]" :key="message" class="error">
          {{ message }}
        </p>
      </div>
      <button type="button" class="add" @click="addAddition">+ ingrediënt</button>
    </fieldset>

    <fieldset class="group">
      <legend>Tag erbij</legend>
      <TagPicker v-model="addedTags" :options="tagOptions" :reserved="reservedTags" />
      <p v-if="errors.added_tag_names" class="error">
        Tags erbij {{ errors.added_tag_names.join(', ') }}
      </p>
    </fieldset>

    <fieldset class="group">
      <legend>Tag eraf</legend>
      <p v-if="baseTags.length === 0" class="hint muted">Het recept heeft geen tags.</p>
      <ul v-else class="checks">
        <li v-for="tag in baseTags" :key="tag">
          <label class="check">
            <input v-model="removedTags" type="checkbox" :value="tag" />
            <span>{{ tag }}</span>
          </label>
        </li>
      </ul>
      <p v-if="errors.removed_tag_names" class="error">
        Tags eraf {{ errors.removed_tag_names.join(', ') }}
      </p>
    </fieldset>

    <div v-if="!embedded" class="actions">
      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? 'Opslaan…' : submitLabel }}
      </button>
      <button type="button" class="cancel" @click="emit('cancel')">Annuleren</button>
    </div>
  </component>
</template>

<style scoped>
.variation-form {
  min-width: 0;
}

.general-errors {
  padding-left: var(--space-6);
}

.light {
  font-weight: 400;
}

.field .error,
.addition-row .error {
  margin-top: var(--space-1);
}

/* Notities: klein, twee regels. */
.notes {
  font-size: var(--text-sm);
  resize: vertical;
}

.group {
  min-width: 0;
  margin: 0 0 var(--space-4);
  padding: 0;
  border: 0;
}

.group legend {
  margin-bottom: var(--space-1);
  padding: 0;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: var(--text-sm);
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Het hele label is het tikvlak (min. --tap hoog), niet alleen het vakje. */
.check {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--tap);
  font-weight: 400;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.check input {
  flex-shrink: 0;
}

/* Dezelfde compacte twee rijen als in RecipeForm: de naam over de hele breedte, daaronder
   hoeveelheid, eenheid en ×. */
.addition-row {
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border);
}

.inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
}

.inputs .name {
  grid-column: 1 / -1;
}

.inputs .quantity,
.inputs .unit {
  min-width: 0;
}

.inputs .unit {
  padding-right: var(--space-1);
}

.inputs .remove {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  line-height: 1;
}

@media (min-width: 40rem) {
  .inputs {
    grid-template-columns: 1fr 6rem 6rem auto;
  }

  .inputs .name {
    grid-column: auto;
  }
}

.add {
  width: 100%;
  margin-top: var(--space-2);
  color: var(--color-accent-text);
  border-style: dashed;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
