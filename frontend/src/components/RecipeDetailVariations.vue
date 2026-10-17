<script setup>
import { computed, ref } from 'vue'
import VariationCard from '@/components/VariationCard.vue'
import VariationForm from '@/components/VariationForm.vue'
import { createVariation, requestVariationDeletion, updateVariation } from '@/api/variations'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useRecipesStore } from '@/stores/recipes'
import { useShoppingListStore } from '@/stores/shoppingList'
import { swappedAlternativeIds } from '@/utils/alternatives'

// De variaties op de receptpagina. De kaarten tonen de verschillen met het basisrecept;
// het formulier klapt open op de pagina, voor een nieuwe variatie onder de kaarten, bij
// bewerken op de plek van de kaart.
//
// Props omlaag, events omhoog: de lijst hoort bij het recept van de pagina, dus dit
// component past hem niet zelf aan maar geeft een nieuwe lijst terug (v-model:variations).
const variations = defineModel('variations', { type: Array, required: true })

const props = defineProps({
  // Het basisrecept: { id, servings, ingredients, tags }.
  recipe: { type: Object, required: true },
  // Het gekozen aantal porties op de pagina.
  servings: { type: Number, required: true },
  // De gewisselde ingrediënten van het basisrecept: { regel-id: alternatief-id }.
  swaps: { type: Object, default: () => ({}) },
})

// reload: na een 409 de nieuwste versie laden; dat doet de pagina.
const emit = defineEmits(['reload'])

// Gedeelde staat: de bestaande tags (voor "Tag erbij") en de boodschappenlijst.
const recipes = useRecipesStore()
const shoppingList = useShoppingListStore()
const { askWithInput } = useConfirmDialog()

const factor = computed(() => props.servings / props.recipe.servings)
const adding = ref(false)
const editingId = ref(null)
const variationErrors = ref({})
const variationMessage = ref(null)
const variationError = ref(null)
// true na een 409: dan kun je hier de nieuwste versie laden.
const variationConflict = ref(false)
const savingVariation = ref(false)
// id van de variatie waarvoor een actie loopt; die knoppen zijn dan uitgeschakeld.
const busyVariationId = ref(null)

function resetVariationFeedback() {
  variationErrors.value = {}
  variationMessage.value = null
  variationError.value = null
  variationConflict.value = false
}

function closeVariationForms() {
  adding.value = false
  editingId.value = null
}

function startAdding() {
  resetVariationFeedback()
  editingId.value = null
  adding.value = true
}

function startEditing(variation) {
  resetVariationFeedback()
  adding.value = false
  editingId.value = variation.id
}

function cancelVariation() {
  resetVariationFeedback()
  closeVariationForms()
}

// Een 422 toont de fouten in het formulier; al het andere als melding erboven.
function showVariationError(e) {
  if (e.kind === 'validation') {
    variationErrors.value = e.errors
  } else {
    variationConflict.value = e.kind === 'conflict'
    variationError.value = e.message
  }
}

async function saveVariation(body) {
  savingVariation.value = true
  resetVariationFeedback()
  try {
    if (editingId.value) {
      const current = variations.value.find((v) => v.id === editingId.value)
      const saved = await updateVariation(props.recipe.id, current.id, {
        ...body,
        lock_version: current.lock_version,
      })
      variations.value = variations.value.map((v) => (v.id === saved.id ? saved : v))
      variationMessage.value = `"${saved.name}" is opgeslagen.`
    } else {
      const saved = await createVariation(props.recipe.id, body)
      variations.value = [...variations.value, saved]
      variationMessage.value = `"${saved.name}" is toegevoegd.`
    }
    closeVariationForms()
    // Een nieuwe tag ("Tag erbij") staat daarna ook in de keuzelijst.
    recipes.loadTags()
  } catch (e) {
    showVariationError(e)
  } finally {
    savingVariation.value = false
  }
}

// Na een conflict: de variaties zoals ze nu op de server staan; jouw wijzigingen vervallen.
function reloadAfterConflict() {
  resetVariationFeedback()
  emit('reload')
}

// Wat op het scherm staat: het gekozen aantal porties en de gewisselde ingrediënten. De
// server rekent de regels uit; een ingrediënt dat de variatie weglaat, blijft weg.
async function addVariationToList(variation) {
  busyVariationId.value = variation.id
  resetVariationFeedback()
  try {
    await shoppingList.addVariation(
      props.recipe.id,
      variation.id,
      props.servings,
      swappedAlternativeIds(props.swaps),
    )
    variationMessage.value = `"${variation.name}" staat op je boodschappenlijst.`
  } catch (e) {
    variationError.value = e.message
  } finally {
    busyVariationId.value = null
  }
}

async function askVariationDeletion(variation) {
  const reason = await askWithInput({
    title: `"${variation.name}" verwijderen?`,
    text: 'De variatie verdwijnt meteen van deze pagina. De beheerder kan haar nog terugzetten.',
    inputLabel: 'Reden (optioneel)',
  })
  if (reason === null) return

  busyVariationId.value = variation.id
  resetVariationFeedback()
  try {
    await requestVariationDeletion(props.recipe.id, variation.id, reason)
    variations.value = variations.value.filter((v) => v.id !== variation.id)
    variationMessage.value = `"${variation.name}" is verwijderd.`
  } catch (e) {
    variationError.value = e.message
  } finally {
    busyVariationId.value = null
  }
}
</script>

<template>
  <section class="variations">
    <h2>Variaties</h2>
    <p v-if="variationMessage" class="notice notice-success" role="status">
      {{ variationMessage }}
    </p>
    <div v-if="variationError" class="notice notice-error" role="alert">
      <p>{{ variationError }}</p>
      <button v-if="variationConflict" type="button" @click="reloadAfterConflict">
        Nieuwste versie laden
      </button>
    </div>

    <p v-if="variations.length === 0 && !adding" class="muted">Nog geen variaties.</p>

    <!-- Twee kolommen; een variatie die je bewerkt krijgt de hele breedte. -->
    <div v-if="variations.length" class="variation-grid">
      <template v-for="variation in variations" :key="variation.id">
        <VariationForm
          v-if="editingId === variation.id"
          class="wide"
          :initial="variation"
          :base-ingredients="recipe.ingredients ?? []"
          :base-tags="recipe.tags ?? []"
          :available-tags="recipes.manualTagNames"
          :reserved-tags="recipes.automaticTagNames"
          :errors="variationErrors"
          :submitting="savingVariation"
          @submit="saveVariation"
          @cancel="cancelVariation"
        />
        <VariationCard
          v-else
          :variation="variation"
          :factor="factor"
          :busy="busyVariationId === variation.id"
          @add-to-list="addVariationToList"
          @edit="startEditing"
          @delete="askVariationDeletion"
        />
      </template>
    </div>

    <VariationForm
      v-if="adding"
      class="new-variation"
      :base-ingredients="recipe.ingredients ?? []"
      :base-tags="recipe.tags ?? []"
      :available-tags="recipes.manualTagNames"
      :reserved-tags="recipes.automaticTagNames"
      :errors="variationErrors"
      :submitting="savingVariation"
      submit-label="Variatie toevoegen"
      @submit="saveVariation"
      @cancel="cancelVariation"
    />
    <button v-else type="button" class="add-variation" @click="startAdding">
      Voeg variatie toe
    </button>
  </section>
</template>

<style scoped>
.variations {
  margin-top: var(--space-5);
}

.variations .notice p {
  margin-bottom: var(--space-2);
}

/* minmax(0, 1fr): een lange naam maakt een kolom niet breder dan de helft. */
.variation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.variation-grid .wide {
  grid-column: 1 / -1;
}

.new-variation {
  margin-bottom: var(--space-3);
}

.add-variation {
  width: 100%;
  color: var(--color-accent-text);
  border-style: dashed;
}
</style>
