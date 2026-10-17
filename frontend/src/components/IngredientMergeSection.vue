<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchIngredients } from '@/api/ingredients'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAdminStore } from '@/stores/admin'
import { findIngredients } from '@/utils/ingredientSearch'

// "Samenvoegen met…" op het bewerkscherm van een ingrediënt. Met de beheercode, zoals
// verwijderen: dit ingrediënt (de bron) verdwijnt. Zonder code vraagt het
// bevestigingsvenster van de pagina er meteen om (useConfirmDialog).
const props = defineProps({
  ingredient: { type: Object, required: true },
})

// Samengevoegd, maar de bron bestaat nog (een recept bevat ze allebei): de melding. De
// view laadt het ingrediënt dan opnieuw. Is de bron weg, dan gaat dit zelf naar het doel.
const emit = defineEmits(['merged'])

const router = useRouter()
const admin = useAdminStore()
const { ask, askWithInput } = useConfirmDialog()
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
// Zoals het zoekveld op "In huis": wat precies zo heet bovenaan, dan op naam.
const mergeCandidates = computed(() =>
  findIngredients(allIngredients.value, mergeQuery.value, {
    exclude: new Set([props.ingredient.id]),
    max: MAX_CANDIDATES,
  }),
)

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
  const source = props.ingredient.name
  const question = {
    title: `"${source}" samenvoegen met "${target.name}"?`,
    text:
      `Recepten, variaties en lijsten met "${source}" gaan naar "${target.name}", en "${source}" ` +
      'wordt verwijderd. Een recept met allebei wordt overgeslagen.',
    confirmLabel: 'Samenvoegen',
  }
  let code = null
  if (admin.isLoggedIn) {
    if (!(await ask(question))) return
  } else {
    code = await askWithInput({ ...question, inputLabel: 'Beheercode', secret: true })
    if (code === null) return
  }

  mergeBusy.value = true
  mergeError.value = null
  try {
    const result = await admin.mergeIngredient(props.ingredient.id, target.id, code || null)
    const notice = mergeNotice(source, result)
    stopMerge()
    if (result.source_deleted) {
      admin.setFlash(notice)
      router.push({ name: 'ingredient', params: { id: String(result.target.id) } })
    } else {
      emit('merged', notice)
    }
  } catch (e) {
    mergeError.value = e.kind === 'unauthorized' ? 'De beheercode is onjuist.' : e.message
  } finally {
    mergeBusy.value = false
  }
}
</script>

<template>
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

<style scoped>
.merge {
  margin-top: var(--space-6);
}

.cancel-merge {
  margin-top: var(--space-2);
}

/* Zoals de andere secties van het bewerkscherm (IngredientEditView). */
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

.food-name {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
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
</style>
