<script setup>
import { computed, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  fetchIngredient,
  fetchIngredients,
  searchNevoFoods,
  updateIngredient,
} from '@/api/ingredients'
import { useAdminStore } from '@/stores/admin'
import { NUTRIENTS } from '@/utils/nutrition'

// Eén ingrediënt koppelen aan een NEVO-product, met de omrekening naar gram en eventueel
// eigen etiketwaarden. Iedereen mag dit, zoals recepten bewerken. De koppeling wordt pas
// bewaard bij "Opslaan"; "Klopt" bevestigt een automatische koppeling zonder iets te wijzigen.
const props = defineProps({
  id: { type: String, required: true },
})

const ingredient = ref(null)
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)
const conflict = ref(false)
const message = ref(null)
const errors = ref({})
const saving = ref(false)

// Het formulier: getallen als tekst, zoals je ze typt ("1,5"); de server leest de komma.
const form = reactive({ nevoFood: null, gramsPerPiece: '', gramsPerMl: '', label: {} })

function asText(value) {
  return value == null ? '' : String(value).replace('.', ',')
}

function fill(loaded) {
  ingredient.value = loaded
  form.nevoFood = loaded.nevo_food
  form.gramsPerPiece = asText(loaded.grams_per_piece)
  form.gramsPerMl = asText(loaded.grams_per_ml)
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
    search.value = ingredient.value.name
    runSearch()
  } catch (e) {
    if (e.kind === 'not_found') notFound.value = true
    else error.value = e.message
  } finally {
    loading.value = false
  }
}

// ---------- NEVO zoeken: suggesties op de naam, daarna zelf zoeken ----------

const search = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref(null)
let searchTimer = null
// Alleen het antwoord op de laatste zoekopdracht telt (een trage eerdere komt soms later).
let searchNumber = 0

async function runSearch() {
  clearTimeout(searchTimer)
  const query = search.value.trim()
  const number = ++searchNumber
  if (query.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const found = await searchNevoFoods(query)
    if (number === searchNumber) results.value = found
  } catch (e) {
    if (number === searchNumber) searchError.value = e.message
  } finally {
    if (number === searchNumber) searching.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 300)
}

onUnmounted(() => clearTimeout(searchTimer))

function choose(food) {
  form.nevoFood = food
  message.value = null
}

const linkChanged = computed(
  () => (form.nevoFood?.id ?? null) !== (ingredient.value?.nevo_food?.id ?? null),
)

const numberFormat = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 })

// "per 100 g: 132 kcal · 12,3 g eiwit"
function per100(food) {
  const value = (v, unit) => (v == null ? `? ${unit}` : `${numberFormat.format(v)} ${unit}`)
  return `per 100 ${food.unit}: ${value(food.kcal, 'kcal')} · ${value(food.protein, 'g')} eiwit`
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
  return value == null ? '' : `NEVO: ${numberFormat.format(value)}`
}

// ---------- Opslaan en Klopt ----------

function fields() {
  const blankToNull = (text) => (text.trim() === '' ? null : text.trim())
  return {
    lock_version: ingredient.value.lock_version,
    nevo_food_id: form.nevoFood?.id ?? null,
    grams_per_piece: blankToNull(form.gramsPerPiece),
    grams_per_ml: blankToNull(form.gramsPerMl),
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

// Met de beheercode, zoals verwijderen: het bronningrediënt verdwijnt. Zonder code vraagt
// het bevestigingsvenster er meteen om.
const router = useRouter()
const admin = useAdminStore()
const confirmDialog = useTemplateRef('confirmDialog')
const merging = ref(false)
const mergeQuery = ref('')
const allIngredients = ref([])
const mergeError = ref(null)
const mergeBusy = ref(false)

async function startMerge() {
  merging.value = true
  mergeError.value = null
  try {
    allIngredients.value = await fetchIngredients()
  } catch (e) {
    mergeError.value = e.message
  }
}

function stopMerge() {
  merging.value = false
  mergeQuery.value = ''
}

const MAX_CANDIDATES = 8
const mergeCandidates = computed(() => {
  const words = mergeQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return allIngredients.value
    .filter((other) => other.id !== ingredient.value.id)
    .filter((other) => words.every((word) => other.name.includes(word)))
    .slice(0, MAX_CANDIDATES)
})

function mergeNotice(source, result) {
  const parts = [`"${source}" is samengevoegd met "${result.target.name}".`]
  if (result.copied.length) parts.push(`Wat "${result.target.name}" nog miste, is overgenomen.`)
  if (result.skipped_recipes.length) {
    parts.push(
      `Overgeslagen, want het recept bevat ze allebei: ${result.skipped_recipes.join(', ')}. ` +
        `Pas die recepten zelf aan; "${source}" blijft zolang bestaan.`,
    )
  }
  return parts.join(' ')
}

async function mergeInto(target) {
  const source = ingredient.value.name
  const question = {
    title: `"${source}" samenvoegen met "${target.name}"?`,
    text:
      `Recepten, variaties en lijsten met "${source}" gaan naar "${target.name}", en "${source}" ` +
      'wordt verwijderd. Een recept met allebei wordt overgeslagen.',
    confirmLabel: 'Samenvoegen',
  }
  let code = null
  if (admin.isLoggedIn) {
    if (!(await confirmDialog.value.ask(question))) return
  } else {
    code = await confirmDialog.value.askWithInput({
      ...question,
      inputLabel: 'Beheercode',
      secret: true,
    })
    if (code === null) return
  }

  mergeBusy.value = true
  mergeError.value = null
  try {
    const result = await admin.mergeIngredient(ingredient.value.id, target.id, code || null)
    const notice = mergeNotice(source, result)
    stopMerge()
    if (result.source_deleted) {
      admin.setFlash(notice)
      router.push({ name: 'ingredient', params: { id: String(result.target.id) } })
    } else {
      await load()
      message.value = notice
    }
  } catch (e) {
    mergeError.value = e.kind === 'unauthorized' ? 'De beheercode is onjuist.' : e.message
  } finally {
    mergeBusy.value = false
  }
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

    <form novalidate @submit.prevent="save">
      <section class="card section">
        <h2>NEVO-product</h2>
        <div v-if="form.nevoFood" class="chosen">
          <p class="food-name">{{ form.nevoFood.name }}</p>
          <p v-if="form.nevoFood.official_name !== form.nevoFood.name" class="muted small">
            NEVO: {{ form.nevoFood.official_name }} ({{ form.nevoFood.code }})
          </p>
          <p class="muted small">{{ per100(form.nevoFood) }}</p>
          <p v-if="linkChanged" class="small changed">Nog niet opgeslagen</p>
          <button type="button" class="unlink" @click="choose(null)">Ontkoppelen</button>
        </div>
        <p v-else class="muted">
          Niet gekoppeld<span v-if="linkChanged"> (nog niet opgeslagen)</span>.
        </p>
        <p v-if="errorOf('nevo_food')" class="error">{{ errorOf('nevo_food') }}</p>

        <div class="field search-field">
          <label for="nevo-search">Zoek in NEVO</label>
          <input
            id="nevo-search"
            v-model="search"
            type="search"
            autocomplete="off"
            @input="onSearchInput"
            @keydown.enter.prevent="runSearch"
          />
        </div>
        <p v-if="searchError" class="error">{{ searchError }}</p>
        <p v-else-if="searching" class="muted small">Zoeken…</p>
        <p v-else-if="search.trim().length >= 2 && !results.length" class="muted small">
          Niets gevonden. Probeer een ander woord, bijv. zonder meervoud.
        </p>
        <ul v-if="results.length" class="results" aria-label="Suggesties uit NEVO">
          <li v-for="food in results" :key="food.id">
            <div>
              <p class="food-name">{{ food.name }}</p>
              <p class="muted small">{{ per100(food) }}</p>
            </div>
            <button
              type="button"
              :disabled="form.nevoFood?.id === food.id"
              :aria-label="`Kies ${food.name}`"
              @click="choose(food)"
            >
              {{ form.nevoFood?.id === food.id ? 'Gekozen' : 'Kies' }}
            </button>
          </li>
        </ul>
      </section>

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

    <section class="card section merge">
      <h2>Samenvoegen</h2>
      <p class="muted small">
        Staat dit ingrediënt er dubbel in (bijv. "trostomaten" en "trostomaat")? Voeg het samen met
        het goede; dit ingrediënt verdwijnt daarna. Hiervoor is de beheercode nodig.
      </p>
      <button v-if="!merging" type="button" class="start-merge" @click="startMerge">
        Samenvoegen met…
      </button>
      <template v-else>
        <div class="field">
          <label for="merge-search">Samenvoegen met</label>
          <input
            id="merge-search"
            v-model="mergeQuery"
            type="search"
            autocomplete="off"
            placeholder="zoek een ingrediënt"
          />
        </div>
        <ul v-if="mergeCandidates.length" class="results" aria-label="Samenvoegen met">
          <li v-for="other in mergeCandidates" :key="other.id">
            <div>
              <p class="food-name">{{ other.name }}</p>
              <p class="muted small">{{ other.nevo_food?.name ?? 'niet gekoppeld' }}</p>
            </div>
            <button
              type="button"
              :disabled="mergeBusy"
              :aria-label="`Samenvoegen met ${other.name}`"
              @click="mergeInto(other)"
            >
              Kies
            </button>
          </li>
        </ul>
        <p v-else-if="mergeQuery.trim()" class="muted small">Geen ingrediënt gevonden.</p>
        <button type="button" class="cancel-merge" @click="stopMerge">Annuleren</button>
      </template>
      <p v-if="mergeError" class="error" role="alert">{{ mergeError }}</p>
    </section>
  </template>

  <p v-else-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
.merge {
  margin-top: var(--space-6);
}

.cancel-merge {
  margin-top: var(--space-2);
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

.chosen {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-brand-soft);
  border-radius: var(--radius);
}

.chosen p {
  margin: 0 0 var(--space-1);
}

.food-name {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.changed {
  font-weight: 600;
  color: var(--color-accent-text);
}

.unlink {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
}

.search-field {
  margin-bottom: var(--space-2);
}

.results {
  margin: 0;
  padding: 0;
  list-style: none;
}

.results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-border);
}

.results li > div {
  min-width: 0;
}

.results p {
  margin: 0;
}

.results button {
  flex-shrink: 0;
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
