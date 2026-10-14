<script setup>
import { computed, nextTick, reactive, ref, useId, useTemplateRef } from 'vue'

// Eén formulier voor toevoegen (leeg) en bewerken (initial = een bestaand item).
// Alleen naam en categorie; de server normaliseert ("  Zuivel " → "zuivel").
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
})

const emit = defineEmits(['save', 'cancel'])

// Unieke id's per formulier: het toevoegformulier en een bewerkformulier staan
// soms tegelijk op de pagina, en een label moet naar precies één veld wijzen.
const uid = useId()

// Waarde van de keuze "Nieuwe categorie…". Kan niet botsen met een echte categorie:
// die zijn genormaliseerd en hebben dus geen hoofdletters.
const NEW_CATEGORY = 'NEW'

const form = reactive({
  name: props.initial.name ?? '',
  // '' = geen categorie.
  category: props.initial.category ?? '',
  newCategory: '',
})

// Ook de eigen categorie van het item, voor het geval die (nog) niet in de lijst staat.
const options = computed(() =>
  props.initial.category && !props.categories.includes(props.initial.category)
    ? [...props.categories, props.initial.category]
    : props.categories,
)

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

  const category = form.category === NEW_CATEGORY ? form.newCategory : form.category
  emit('save', { name: form.name, category: category.trim() || null })
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
