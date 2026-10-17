<script setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PantryRecipeGroups from '@/components/PantryRecipeGroups.vue'
import PantryStock from '@/components/PantryStock.vue'
import RecipeFilterChips from '@/components/RecipeFilterChips.vue'
import { useRecipeFilter } from '@/composables/useRecipeFilter'
import { usePantryStore } from '@/stores/pantry'
import { useRecipesStore } from '@/stores/recipes'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useShoppingListStore } from '@/stores/shoppingList'
import { filterRecipes } from '@/utils/categories'

// "In huis": wat je in huis hebt, en welke recepten je daarmee (bijna) kunt maken. De
// voorraad staat op de server, één voor iedereen met de link. Afgestreepte boodschappen
// komen vanzelf in huis (dat doet de server bij het afvinken). De recepten staan in
// PantryRecipeGroups, de voorraad in PantryStock; wat een tik doet, staat hier.
const pantry = usePantryStore()
const recipes = useRecipesStore()
const shoppingList = useShoppingListStore()
const server = useServerStatusStore()
const confirmDialog = useTemplateRef('confirmDialog')

// Hetzelfde filter als op het receptenoverzicht, in de URL. Tags filtert de server; de
// categorie gebeurt hier, net als daar, zodat de categorie-chips blijven staan.
const { selectedTags, selectedCategory } = useRecipeFilter()

const GROUP_TITLES = ['Alles in huis', 'Mist 1', 'Mist 2']

const groups = computed(() =>
  pantry.groups
    .map((group) => ({
      ...group,
      title: GROUP_TITLES[group.missing_count],
      recipes: filterRecipes(group.recipes, { selected: selectedCategory.value }),
    }))
    .filter((group) => group.recipes.length),
)

// Een melding bij een actie op de voorraad of de lijst (de server weigert, geen netwerk).
const actionError = ref(null)

async function run(action) {
  actionError.value = null
  try {
    await action()
  } catch (e) {
    actionError.value = e.message
  }
}

// ---------- Ontbrekende op lijst ----------

// De recepten waarvan de ontbrekende net op de lijst zijn gezet (id's).
const added = ref(new Set())
const adding = ref(new Set())

function addMissing(recipe) {
  if (adding.value.has(recipe.id)) return
  adding.value.add(recipe.id)
  run(async () => {
    await shoppingList.addMissing(recipe, recipe.missing)
    added.value.add(recipe.id)
  }).finally(() => adding.value.delete(recipe.id))
}

// ---------- Voorraad ----------

// Een gevonden ingrediënt of een snelkeuze: in huis.
function put(ingredient) {
  run(() => pantry.set(ingredient.id, true))
}

function remove(item) {
  run(() => pantry.set(item.id, false))
}

// Een basisingrediënt is op (×) of weer in huis (↺).
function toggleStaple(staple) {
  run(() => pantry.set(staple.id, !staple.present))
}

async function resetToDefault() {
  const confirmed = await confirmDialog.value.ask({
    title: 'Terug naar standaard?',
    text: 'Alles wat je in huis hebt gezet gaat eruit, en de basis staat weer helemaal in huis.',
    confirmLabel: 'Terug naar standaard',
  })
  if (confirmed) run(() => pantry.reset())
}

// ---------- Laden ----------

// Deze pagina opent pas als de server online is (meta.needsServer in de router); tot dan
// toont App.vue de gedeelde laad- of offlinemelding, en daarna opent hij opnieuw en laadt
// hij vers. Mislukt het laden toch, dan kijkt de serverstatus opnieuw: is de server weg,
// dan neemt die gedeelde melding het over. Antwoordt de server wel maar met een fout
// (bijv. een 500), dan staat die melding op de plek van "In huis laden…".
const loadError = ref(null)

function load() {
  loadError.value = null
  pantry.load(selectedTags.value).catch((e) => {
    loadError.value = e.message
    server.check()
  })
}

// Bij openen, bij elk ander tagfilter, en bij terugkeren naar de app: iemand anders (of
// het afvinken van boodschappen) kan de voorraad intussen hebben veranderd.
watch(
  () => selectedTags.value.join(','),
  (now, before) => {
    if (before === undefined) load()
    else run(() => pantry.loadRecipes(selectedTags.value))
  },
  { immediate: true },
)

function onVisibilityChange() {
  if (document.visibilityState === 'visible') load()
}

onMounted(() => {
  recipes.loadTags()
  recipes.loadCategories()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))
</script>

<template>
  <h1>In huis</h1>

  <!-- Chips en voorraad pas als de voorraad er is; daarvoor alleen een laadregel, zoals
       "Recepten laden…" op het overzicht. -->
  <p v-if="!pantry.pantry" class="muted">{{ loadError ?? 'In huis laden…' }}</p>

  <template v-else>
    <p v-if="pantry.isDefault" class="intro card">
      Zet hieronder wat je in huis hebt. Dan zie je welke recepten je ermee kunt maken, en wat er
      nog ontbreekt. Boodschappen die je afstreept, komen vanzelf in huis.
    </p>

    <RecipeFilterChips
      :categories="recipes.categories"
      :recipes="pantry.allRecipes"
      :tags="recipes.tags"
    />

    <p v-if="!groups.length" class="no-results card" role="status">
      Nog geen recept dat je (bijna) kunt maken<template v-if="selectedTags.length">
        met {{ selectedTags.join(' + ') }}</template
      >. Zet hieronder meer in huis.
    </p>

    <PantryRecipeGroups
      :groups="groups"
      :added="added"
      :adding="adding"
      @add-missing="addMissing"
    />

    <PantryStock
      :error="actionError"
      @put="put"
      @remove="remove"
      @toggle-staple="toggleStaple"
      @reset="resetToDefault"
    />
  </template>

  <ConfirmDialog ref="confirmDialog" />
</template>

<style scoped>
.intro {
  color: var(--color-text-muted);
}

.no-results {
  text-align: center;
}
</style>
