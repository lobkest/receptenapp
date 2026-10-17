<script setup>
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import IngredientMergeSection from '@/components/IngredientMergeSection.vue'
import IngredientNevoPicker from '@/components/IngredientNevoPicker.vue'
import IngredientStaple from '@/components/IngredientStaple.vue'
import IngredientTraits from '@/components/IngredientTraits.vue'
import { fetchIngredient, fetchTraits, updateIngredient } from '@/api/ingredients'
import { provideConfirmDialog } from '@/composables/useConfirmDialog'
import { useAdminStore } from '@/stores/admin'
import { formatDecimal } from '@/utils/format'
import { NUTRIENTS } from '@/utils/nutrition'

// Eén ingrediënt koppelen aan een NEVO-product, met de omrekening naar gram en eventueel
// eigen etiketwaarden. Iedereen mag dit, zoals recepten bewerken. De koppeling wordt pas
// bewaard bij "Opslaan"; "Klopt" bevestigt een automatische koppeling zonder iets te wijzigen.
// Kenmerken, basis en samenvoegen slaan meteen zelf op: IngredientTraits, IngredientStaple
// en IngredientMergeSection. Het NEVO-product kiezen: IngredientNevoPicker.
const props = defineProps({
  id: { type: String, required: true },
})

const admin = useAdminStore()
// Eén bevestigingsvenster voor de pagina; IngredientMergeSection gebruikt het.
provideConfirmDialog(useTemplateRef('confirmDialog'))

const ingredient = ref(null)
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)
const conflict = ref(false)
const message = ref(null)
const errors = ref({})
const saving = ref(false)

// Het formulier: getallen als tekst, zoals je ze typt ("1,5"); de server leest de komma.
const form = reactive({
  nevoFood: null,
  gramsPerPiece: '',
  gramsPerMl: '',
  label: {},
  negligible: false,
})

function asText(value) {
  return value == null ? '' : String(value).replace('.', ',')
}

function fill(loaded) {
  ingredient.value = loaded
  form.nevoFood = loaded.nevo_food
  form.gramsPerPiece = asText(loaded.grams_per_piece)
  form.gramsPerMl = asText(loaded.grams_per_ml)
  form.negligible = loaded.negligible ?? false
  form.label = Object.fromEntries(NUTRIENTS.map(({ key }) => [key, asText(loaded.label[key])]))
}

async function load() {
  // Na samenvoegen: de melding van het ingrediënt dat hierin opging.
  message.value = admin.takeFlash()
  loading.value = true
  notFound.value = false
  error.value = null
  conflict.value = false
  try {
    fill(await fetchIngredient(props.id))
  } catch (e) {
    if (e.kind === 'not_found') notFound.value = true
    else error.value = e.message
  } finally {
    loading.value = false
  }
}

// ---------- Kenmerken en basis: meteen opgeslagen ----------

// Eén keer per bezoek aan de pagina, ook als het ingrediënt opnieuw laadt.
const traits = ref([])
const traitsLoadError = ref(null)

onMounted(async () => {
  try {
    traits.value = await fetchTraits()
  } catch (e) {
    traitsLoadError.value = e.message
  }
})

function onTraitsSaved(fields) {
  ingredient.value = { ...ingredient.value, ...fields }
}

function onStapleSaved(staple) {
  ingredient.value = { ...ingredient.value, staple }
}

// ---------- Omrekening en etiket ----------

const usedInPieces = computed(() => ingredient.value?.units.includes('stuks'))
const usedInMl = computed(() => ingredient.value?.units.some((u) => ['ml', 'tl', 'el'].includes(u)))
const unitsText = computed(() => ingredient.value?.units.join(', '))

// Waar elke waarde vandaan komt, zoals het nu in het formulier staat.
function sourceOf(key) {
  if (form.label[key].trim() !== '') return 'etiket'
  if (form.nevoFood?.[key] != null) return 'NEVO'
  return 'onbekend'
}

function nevoPlaceholder(key) {
  const value = form.nevoFood?.[key]
  return value == null ? '' : `NEVO: ${formatDecimal(value)}`
}

// ---------- Opslaan en Klopt ----------

function fields() {
  const blankToNull = (text) => (text.trim() === '' ? null : text.trim())
  return {
    lock_version: ingredient.value.lock_version,
    nevo_food_id: form.nevoFood?.id ?? null,
    grams_per_piece: blankToNull(form.gramsPerPiece),
    grams_per_ml: blankToNull(form.gramsPerMl),
    negligible: form.negligible,
    ...Object.fromEntries(
      NUTRIENTS.map(({ key }) => [`label_${key}`, blankToNull(form.label[key])]),
    ),
  }
}

async function send(body, done) {
  saving.value = true
  errors.value = {}
  error.value = null
  conflict.value = false
  message.value = null
  try {
    fill(await updateIngredient(ingredient.value.id, body))
    message.value = done
  } catch (e) {
    if (e.kind === 'validation') errors.value = e.errors
    else {
      conflict.value = e.kind === 'conflict'
      error.value = e.message
    }
  } finally {
    saving.value = false
  }
}

function save() {
  send(fields(), 'Opgeslagen.')
}

function confirmReview() {
  send({ lock_version: ingredient.value.lock_version }, 'Gecontroleerd.')
}

function errorOf(field) {
  return errors.value[field]?.join(', ')
}

// ---------- Samenvoegen ----------

// De bron bestaat nog (een recept bevat ze allebei): opnieuw laden, met de melding.
async function onMerged(notice) {
  await load()
  message.value = notice
}

// Van /ingredienten/1 naar /ingredienten/2 hergebruikt Vue dit component; daarom op het id.
watch(() => props.id, load, { immediate: true })
</script>

<template>
  <p><RouterLink to="/ingredienten" class="back-link top">← Alle ingrediënten</RouterLink></p>

  <p v-if="loading" class="muted">Ingrediënt laden…</p>

  <div v-else-if="notFound">
    <h1>Ingrediënt niet gevonden</h1>
    <p>Dit ingrediënt bestaat niet (meer).</p>
  </div>

  <template v-else-if="ingredient">
    <h1>{{ ingredient.name }}</h1>

    <p v-if="message" class="notice notice-success" role="status">{{ message }}</p>
    <div v-if="error" class="notice notice-error" role="alert">
      {{ error }}
      <button v-if="conflict" type="button" class="reload" @click="load">Herladen</button>
    </div>

    <div v-if="ingredient.needs_review" class="review card">
      <p>
        <strong>Te controleren.</strong> Dit ingrediënt is automatisch gekoppeld. Klopt het
        NEVO-product en de omrekening?
      </p>
      <button type="button" class="btn-primary" :disabled="saving" @click="confirmReview">
        Klopt
      </button>
    </div>

    <IngredientTraits
      :ingredient="ingredient"
      :traits="traits"
      :load-error="traitsLoadError"
      @saved="onTraitsSaved"
    />

    <IngredientStaple :ingredient="ingredient" @saved="onStapleSaved" />

    <form novalidate @submit.prevent="save">
      <section class="card section negligible">
        <label class="check">
          <input id="negligible" v-model="form.negligible" type="checkbox" />
          <span>
            <strong>Verwaarloosbaar</strong><br />
            <span class="muted small">
              Telt als 0 in de voedingswaarde, voor kleine hoeveelheden zoals bakpoeder of
              specerijen. Een koppeling is dan niet nodig.
            </span>
          </span>
        </label>
      </section>

      <IngredientNevoPicker
        v-model:food="form.nevoFood"
        :name="ingredient.name"
        :saved="ingredient.nevo_food"
        :error="errorOf('nevo_food')"
        @chosen="message = null"
      />

      <section class="card section">
        <h2>Omrekening</h2>
        <p class="muted small">
          <template v-if="unitsText">Recepten gebruiken dit in: {{ unitsText }}. </template>
          tl = 5 ml en el = 15 ml. Gram telt altijd mee; leeg = telt niet mee.
        </p>
        <div class="two">
          <div class="field">
            <label for="grams-per-piece">Gram per stuk</label>
            <input
              id="grams-per-piece"
              v-model="form.gramsPerPiece"
              inputmode="decimal"
              autocomplete="off"
              :aria-invalid="!!errorOf('grams_per_piece')"
            />
            <p v-if="errorOf('grams_per_piece')" class="error">{{ errorOf('grams_per_piece') }}</p>
            <p v-else-if="usedInPieces && !form.gramsPerPiece.trim()" class="hint">
              Nodig voor stuks
            </p>
          </div>
          <div class="field">
            <label for="grams-per-ml">Gram per ml</label>
            <input
              id="grams-per-ml"
              v-model="form.gramsPerMl"
              inputmode="decimal"
              autocomplete="off"
              :aria-invalid="!!errorOf('grams_per_ml')"
            />
            <p v-if="errorOf('grams_per_ml')" class="error">{{ errorOf('grams_per_ml') }}</p>
            <p v-else-if="usedInMl && !form.gramsPerMl.trim()" class="hint">
              Nodig voor ml, tl en el
            </p>
          </div>
        </div>
      </section>

      <section class="card section">
        <h2>Etiketwaarden per 100 g</h2>
        <p class="muted small">
          Optioneel. Een ingevulde waarde gaat voor op NEVO; een leeg veld gebruikt NEVO.
        </p>
        <div class="labels">
          <div v-for="nutrient in NUTRIENTS" :key="nutrient.key" class="field">
            <label :for="`label-${nutrient.key}`">
              {{ nutrient.label }} ({{ nutrient.unit }})
            </label>
            <input
              :id="`label-${nutrient.key}`"
              v-model="form.label[nutrient.key]"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="nevoPlaceholder(nutrient.key)"
              :aria-invalid="!!errorOf(`label_${nutrient.key}`)"
            />
            <p v-if="errorOf(`label_${nutrient.key}`)" class="error">
              {{ errorOf(`label_${nutrient.key}`) }}
            </p>
            <p v-else class="source small" :data-source="sourceOf(nutrient.key)">
              bron: {{ sourceOf(nutrient.key) }}
            </p>
          </div>
        </div>
      </section>

      <button type="submit" class="btn-primary btn-block" :disabled="saving">Opslaan</button>
    </form>

    <IngredientMergeSection :ingredient="ingredient" @merged="onMerged" />
  </template>

  <p v-else-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
.negligible .check {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: var(--tap);
  font-weight: 400;
  cursor: pointer;
}

.negligible input {
  flex-shrink: 0;
  margin-top: 0.15rem;
}

.back-link.top {
  margin-top: 0;
}

.section {
  margin-bottom: var(--space-4);
}

.section h2 {
  margin-bottom: var(--space-2);
}

.small {
  font-size: var(--text-sm);
}

.section p {
  margin-bottom: var(--space-2);
}

.review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin-bottom: var(--space-4);
  background: var(--color-error-soft);
  border-color: transparent;
}

.review p {
  flex: 1 1 14rem;
  margin: 0;
  color: var(--color-error-text);
}

.reload {
  margin-left: var(--space-2);
}

/* Twee velden naast elkaar, ook op een telefoon: ze zijn kort. */
.two,
.labels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--space-3);
}

.hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-error-text);
}

.source {
  margin: 0;
  color: var(--color-text-muted);
}

.source[data-source='etiket'] {
  font-weight: 600;
  color: var(--color-accent-text);
}
</style>
