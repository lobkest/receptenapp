<script setup>
import { reactive, ref, useId } from 'vue'
import { CATEGORY_SUGGESTIONS } from '@/stores/standardItems'
import { UNITS } from '@/utils/quantity'

// Eén formulier voor toevoegen (leeg) en bewerken (initial = een bestaand item).
const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Toevoegen' },
  // Bij bewerken een knop "Annuleren".
  cancellable: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'cancel'])

// Unieke id's per formulier: het toevoegformulier en een bewerkformulier staan
// soms tegelijk op de pagina, en een label moet naar precies één veld wijzen.
const uid = useId()

const form = reactive({
  name: props.initial.name ?? '',
  quantity: props.initial.quantity ?? '',
  unit: props.initial.unit ?? 'stuks',
  category: props.initial.category ?? '',
})

const errors = ref({})

// Hier alleen de controles waar de gebruiker een melding voor nodig heeft;
// de store normaliseert en controleert daarna nog een keer zelf.
function validate() {
  const result = {}
  if (!form.name.trim()) result.name = 'Vul een naam in.'
  if (form.quantity !== '' && !(Number(form.quantity) > 0)) {
    result.quantity = 'Vul een hoeveelheid groter dan 0 in, of laat het leeg.'
  }
  return result
}

function onSubmit() {
  errors.value = validate()
  if (Object.keys(errors.value).length) return
  emit('save', { ...form })
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
        :aria-invalid="!!errors.name"
        :aria-describedby="errors.name ? `${uid}-name-error` : undefined"
      />
      <p v-if="errors.name" :id="`${uid}-name-error`" class="error">{{ errors.name }}</p>
    </div>

    <div class="amount">
      <div class="field">
        <label :for="`${uid}-quantity`">Hoeveelheid</label>
        <input
          :id="`${uid}-quantity`"
          v-model="form.quantity"
          type="number"
          step="any"
          min="0"
          inputmode="decimal"
          class="quantity"
          :aria-invalid="!!errors.quantity"
          :aria-describedby="`${uid}-quantity-message`"
        />
      </div>
      <div class="field">
        <label :for="`${uid}-unit`">Eenheid</label>
        <select :id="`${uid}-unit`" v-model="form.unit" class="unit">
          <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
        </select>
      </div>
    </div>
    <!-- Melding of uitleg: steeds hetzelfde id, zodat aria-describedby altijd klopt. -->
    <p v-if="errors.quantity" :id="`${uid}-quantity-message`" class="error quantity-error">
      {{ errors.quantity }}
    </p>
    <p v-else :id="`${uid}-quantity-message`" class="hint muted">
      Optioneel. Leeg betekent: geen vaste hoeveelheid.
    </p>

    <div class="field">
      <label :for="`${uid}-category`">Categorie (optioneel)</label>
      <input
        :id="`${uid}-category`"
        v-model="form.category"
        type="text"
        class="category"
        :list="`${uid}-categories`"
        placeholder="bijv. zuivel"
      />
      <datalist :id="`${uid}-categories`">
        <option v-for="category in CATEGORY_SUGGESTIONS" :key="category" :value="category" />
      </datalist>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary save">{{ submitLabel }}</button>
      <button v-if="cancellable" type="button" class="cancel" @click="emit('cancel')">
        Annuleren
      </button>
    </div>
  </form>
</template>

<style scoped>
.amount {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.amount .field {
  margin-bottom: 0;
}

.hint,
.quantity-error {
  margin: var(--space-1) 0 var(--space-4);
  font-size: var(--text-sm);
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
