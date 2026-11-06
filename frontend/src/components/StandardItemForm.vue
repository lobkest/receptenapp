<script setup>
import { computed, nextTick, reactive, ref, useId, useTemplateRef } from 'vue'
import IngredientSearchField from '@/components/IngredientSearchField.vue'
import OfflineHint from '@/components/OfflineHint.vue'
import { useIngredientList } from '@/composables/useIngredientNames'
import { TEMPORARY_NAME, isTemporary } from '@/utils/temporaryItems'

// Eén formulier voor toevoegen (leeg) en bewerken (initial = een bestaand item).
// Naam en categorie; de server normaliseert ("  Zuivel " → "zuivel").
// Bij bewerken (linkable) ook "Hetzelfde als ingrediënt": een bestaand ingrediënt met een
// andere naam ("uien" is "ui"), zodat het huisje en "✓ op lijst" het kennen. Dat gaat
// mee met Opslaan, als tweede argument van save: het gekozen ingrediënt-id, null
// (ontkoppeld) of undefined (niet veranderd). Offline kan koppelen niet.
const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Toevoegen' },
  // Bij bewerken een knop "Annuleren".
  cancellable: { type: Boolean, default: false },
  // De bestaande categorieën, uniek en gesorteerd (uit de store).
  categories: { type: Array, default: () => [] },
  // Fouten van de server, bijv. { name: ['is al in gebruik'] }.
  errors: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  // Het veld "Hetzelfde als ingrediënt" (alleen bij bewerken van een item op de server).
  linkable: { type: Boolean, default: false },
  // Geen verbinding: koppelen staat uit.
  offline: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'cancel'])

// Unieke id's per formulier: het toevoegformulier en een bewerkformulier staan
// soms tegelijk op de pagina, en een label moet naar precies één veld wijzen.
const uid = useId()

// Waarde van de keuze "Nieuwe categorie…". Kan niet botsen met een echte categorie:
// die zijn genormaliseerd en hebben dus geen hoofdletters.
const NEW_CATEGORY = 'NEW'
// Een tijdelijk item (Tijdelijk op de standaardlijst) begint met de keuze "Tijdelijk": zo
// blijft het tijdelijk. Een categorie of "Geen categorie" maakt het permanent.
const TEMPORARY = 'TEMPORARY'
const temporary = isTemporary(props.initial)

const form = reactive({
  name: props.initial.name ?? '',
  // '' = geen categorie.
  category: temporary ? TEMPORARY : (props.initial.category ?? ''),
  newCategory: '',
})

// Ook de eigen categorie van het item, voor het geval die (nog) niet in de lijst staat.
const options = computed(() =>
  props.initial.category && !props.categories.includes(props.initial.category)
    ? [...props.categories, props.initial.category]
    : props.categories,
)

// Het gekoppelde ingrediënt: { id, name } of null. De naam uit de ingrediëntenlijst (ook
// offline, uit de snapshot); onbekend nog: alleen het id.
const ingredients = useIngredientList()
const linkedId = ref(props.initial.ingredient_id ?? null)
const linkedName = computed(
  () => ingredients.value.find((ingredient) => ingredient.id === linkedId.value)?.name ?? null,
)

function chooseIngredient(ingredient) {
  linkedId.value = ingredient.id
}

const newCategoryInput = useTemplateRef('newCategoryInput')

// Kies je "Nieuwe categorie…", dan verschijnt het tekstveld en krijgt het meteen de focus.
async function onCategoryChange() {
  if (form.category !== NEW_CATEGORY) return
  await nextTick()
  newCategoryInput.value?.focus()
}

const clientErrors = ref({})

// Eerst onze eigen meldingen; daarna die van de server (met het veld ervoor).
const shownErrors = computed(() => ({
  name: clientErrors.value.name ?? serverError('Naam', 'name'),
  category: clientErrors.value.category ?? serverError('Categorie', 'category'),
}))

function serverError(label, field) {
  return props.errors[field]?.length ? `${label} ${props.errors[field].join(', ')}` : null
}

function validate() {
  const result = {}
  if (!form.name.trim()) result.name = 'Vul een naam in.'
  if (form.category === NEW_CATEGORY && !form.newCategory.trim()) {
    result.category = 'Vul een naam voor de nieuwe categorie in.'
  }
  return result
}

function onSubmit() {
  clientErrors.value = validate()
  if (Object.keys(clientErrors.value).length) return

  const link =
    props.linkable && linkedId.value !== (props.initial.ingredient_id ?? null)
      ? linkedId.value
      : undefined
  if (form.category === TEMPORARY) {
    emit('save', { name: form.name, category: null }, link)
    return
  }
  const category = form.category === NEW_CATEGORY ? form.newCategory : form.category
  const fields = { name: form.name, category: category.trim() || null }
  emit('save', temporary ? { ...fields, temporary: false } : fields, link)
}
</script>

<template>
  <form class="standard-form" novalidate @submit.prevent="onSubmit">
    <div class="field">
      <label :for="`${uid}-name`">Naam</label>
      <input
        :id="`${uid}-name`"
        v-model="form.name"
        type="text"
        class="name"
        placeholder="bijv. melk"
        :aria-invalid="!!shownErrors.name"
        :aria-describedby="shownErrors.name ? `${uid}-name-error` : undefined"
      />
      <p v-if="shownErrors.name" :id="`${uid}-name-error`" class="error">
        {{ shownErrors.name }}
      </p>
    </div>

    <div class="field">
      <label :for="`${uid}-category`">Categorie</label>
      <select
        :id="`${uid}-category`"
        v-model="form.category"
        class="category"
        @change="onCategoryChange"
      >
        <option v-if="temporary" :value="TEMPORARY">{{ TEMPORARY_NAME }}</option>
        <option value="">Geen categorie</option>
        <option v-for="category in options" :key="category" :value="category">
          {{ category }}
        </option>
        <option :value="NEW_CATEGORY">Nieuwe categorie…</option>
      </select>
    </div>

    <div v-if="form.category === NEW_CATEGORY" class="field">
      <label :for="`${uid}-new-category`">Nieuwe categorie</label>
      <input
        :id="`${uid}-new-category`"
        ref="newCategoryInput"
        v-model="form.newCategory"
        type="text"
        class="new-category"
        placeholder="bijv. zuivel"
        :aria-invalid="!!shownErrors.category"
        :aria-describedby="shownErrors.category ? `${uid}-category-error` : undefined"
      />
    </div>
    <p v-if="shownErrors.category" :id="`${uid}-category-error`" class="error category-error">
      {{ shownErrors.category }}
    </p>

    <div v-if="linkable" class="field link-field">
      <template v-if="linkedId != null">
        <span :id="`${uid}-link-label`" class="label">Hetzelfde als ingrediënt</span>
        <p class="linked" :aria-labelledby="`${uid}-link-label`">
          <span class="linked-name">{{ linkedName ?? `ingrediënt ${linkedId}` }}</span>
          <button type="button" class="unlink" :disabled="offline" @click="linkedId = null">
            Ontkoppelen
          </button>
        </p>
      </template>
      <IngredientSearchField
        v-else-if="!offline"
        :id="`${uid}-ingredient`"
        class="link-search"
        label="Hetzelfde als ingrediënt"
        placeholder="bijv. ui"
        @choose="chooseIngredient"
      />
      <span v-else class="label">Hetzelfde als ingrediënt</span>
      <OfflineHint v-if="offline" />
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary save" :disabled="submitting">
        {{ submitLabel }}
      </button>
      <button v-if="cancellable" type="button" class="cancel" @click="emit('cancel')">
        Annuleren
      </button>
    </div>
  </form>
</template>

<style scoped>
/* Zoals een <label>, maar zonder veld: het gekoppelde ingrediënt is tekst met een knop. */
.label {
  font-weight: 600;
}

.linked {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
}

.linked-name {
  font-size: var(--text-lg);
}

.unlink {
  font-size: var(--text-sm);
}

.category-error {
  margin: calc(-1 * var(--space-3)) 0 var(--space-4);
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.form-actions button {
  flex: 1 1 auto;
}

@media (min-width: 40rem) {
  .form-actions button {
    flex: 0 0 auto;
  }
}
</style>
