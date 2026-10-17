<script setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import RecipeFilterChips from '@/components/RecipeFilterChips.vue'
import { useIngredientList, useIngredientNames } from '@/composables/useIngredientNames'
import { useRecipeFilter } from '@/composables/useRecipeFilter'
import { usePantryStore } from '@/stores/pantry'
import { useRecipesStore } from '@/stores/recipes'
import { useShoppingListStore } from '@/stores/shoppingList'
import { categoryKey } from '@/utils/categories'
import { findIngredients } from '@/utils/ingredientSearch'

// "In huis": wat je in huis hebt, en welke recepten je daarmee (bijna) kunt maken. De
// voorraad staat op de server, één voor iedereen met de link. Afgestreepte boodschappen
// komen vanzelf in huis (dat doet de server bij het afvinken).
const pantry = usePantryStore()
const recipes = useRecipesStore()
const shoppingList = useShoppingListStore()
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
      recipes: group.recipes.filter(
        (recipe) =>
          selectedCategory.value === null ||
          categoryKey(recipe.category) === selectedCategory.value,
      ),
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

// Het bestaande "op lijst" voor losse regels, met de porties van het recept zelf. Het
// origineel gaat op de lijst, geen alternatief.
function addMissing(recipe) {
  if (adding.value.has(recipe.id)) return
  adding.value.add(recipe.id)
  run(async () => {
    await shoppingList.addRecipe(
      recipe.id,
      recipe.servings,
      recipe.missing.map((row) => row.id),
    )
    added.value.add(recipe.id)
  }).finally(() => adding.value.delete(recipe.id))
}

// ---------- Voorraad ----------

const ingredientList = useIngredientList()
const ingredientNames = useIngredientNames()
const query = ref('')

const inHouseIds = computed(
  () =>
    new Set([
      ...pantry.inHouse.map((item) => item.id),
      ...pantry.staples.filter((staple) => staple.present).map((staple) => staple.id),
    ]),
)

// Bestaande ingrediënten die bij de zoekterm passen en nog niet in huis zijn. Wat precies
// zo heet, staat bovenaan.
const matches = computed(() =>
  findIngredients(ingredientList.value, query.value, { exclude: inHouseIds.value }),
)

function put(ingredient) {
  query.value = ''
  run(() => pantry.set(ingredient.id, true))
}

function addFirstMatch() {
  if (matches.value.length) put(matches.value[0])
}

function remove(item) {
  run(() => pantry.set(item.id, false))
}

const outCount = computed(() => pantry.staples.filter((staple) => !staple.present).length)

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

// Bij openen, bij elk ander tagfilter, en bij terugkeren naar de app: iemand anders (of
// het afvinken van boodschappen) kan de voorraad intussen hebben veranderd.
watch(
  () => selectedTags.value.join(','),
  (now, before) => {
    if (before === undefined) pantry.load(selectedTags.value)
    else run(() => pantry.loadRecipes(selectedTags.value))
  },
  { immediate: true },
)

function onVisibilityChange() {
  if (document.visibilityState === 'visible') pantry.load(selectedTags.value)
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

  <p v-if="pantry.isDefault" class="intro card">
    Zet hieronder wat je in huis hebt. Dan zie je welke recepten je ermee kunt maken, en wat er nog
    ontbreekt. Boodschappen die je afstreept, komen vanzelf in huis.
  </p>

  <RecipeFilterChips
    :categories="recipes.categories"
    :recipes="pantry.allRecipes"
    :tags="recipes.tags"
  />

  <p v-if="pantry.loading && !pantry.pantry" class="muted">Laden…</p>

  <div v-else-if="pantry.error" class="notice notice-error" role="alert">
    <p>{{ pantry.error }}</p>
    <button type="button" class="btn-primary" @click="pantry.load(selectedTags)">
      Opnieuw proberen
    </button>
  </div>

  <template v-else>
    <p v-if="!groups.length" class="no-results card" role="status">
      Nog geen recept dat je (bijna) kunt maken<template v-if="selectedTags.length">
        met {{ selectedTags.join(' + ') }}</template
      >. Zet hieronder meer in huis.
    </p>

    <section
      v-for="group in groups"
      :key="group.missing_count"
      class="match-group"
      :aria-labelledby="`group-${group.missing_count}`"
    >
      <h2 :id="`group-${group.missing_count}`" class="section-title">
        <span class="group-title">{{ group.title }}</span>
        <span class="group-count">{{ group.recipes.length }}</span>
      </h2>
      <ul class="matches card">
        <li v-for="recipe in group.recipes" :key="recipe.id" class="match">
          <div class="match-text">
            <RouterLink :to="`/recepten/${recipe.id}`" class="match-title">
              {{ recipe.title }}
            </RouterLink>
            <p v-if="recipe.missing.length" class="missing">
              mist: {{ recipe.missing.map((row) => row.name).join(', ') }}
            </p>
          </div>
          <template v-if="recipe.missing.length">
            <p v-if="added.has(recipe.id)" class="added" role="status">Op de lijst ✓</p>
            <button
              v-else
              type="button"
              class="add-missing"
              :disabled="adding.has(recipe.id)"
              @click="addMissing(recipe)"
            >
              Ontbrekende op lijst
            </button>
          </template>
        </li>
      </ul>
    </section>

    <section v-if="pantry.pantry" class="stock card" aria-labelledby="stock-title">
      <h2 id="stock-title">Voorraad</h2>

      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

      <div class="field">
        <label for="pantry-search">Ingrediënt in huis zetten</label>
        <input
          id="pantry-search"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="zoek een ingrediënt"
          @keydown.enter.prevent="addFirstMatch"
        />
        <IngredientSuggestion
          v-if="!matches.length"
          :name="query"
          :names="ingredientNames"
          @use="(name) => (query = name)"
        />
      </div>
      <ul v-if="matches.length" class="chips matches-found" aria-label="Gevonden ingrediënten">
        <li v-for="ingredient in matches" :key="ingredient.id">
          <button type="button" class="chip add-chip" @click="put(ingredient)">
            + {{ ingredient.name }}
          </button>
        </li>
      </ul>
      <p v-else-if="query.trim().length >= 2" class="muted small">
        Geen ingrediënt gevonden dat nog niet in huis is.
      </p>

      <h3>In huis</h3>
      <ul v-if="pantry.inHouse.length" class="chips in-house" aria-label="In huis">
        <li v-for="item in pantry.inHouse" :key="item.id">
          <span class="chip present-chip">
            {{ item.name }}
            <button
              type="button"
              class="chip-remove"
              :aria-label="`${item.name} weghalen`"
              :disabled="pantry.busy.has(item.id)"
              @click="remove(item)"
            >
              ×
            </button>
          </span>
        </li>
      </ul>
      <p v-else class="muted small">Behalve de basis nog niets.</p>

      <template v-if="pantry.suggestions.length">
        <h3>Snelkeuze</h3>
        <ul class="chips quick-picks" aria-label="Snelkeuze">
          <li v-for="item in pantry.suggestions" :key="item.id">
            <button
              type="button"
              class="chip add-chip"
              :disabled="pantry.busy.has(item.id)"
              @click="put(item)"
            >
              + {{ item.name }}
            </button>
          </li>
        </ul>
      </template>

      <details v-if="pantry.staples.length" class="staples">
        <summary>
          Basis
          <span class="muted"
            >({{ pantry.staples.length
            }}<template v-if="outCount">, {{ outCount }} op</template>)</span
          >
        </summary>
        <p class="muted small">
          Staat standaard in huis. Tik als iets op is; ↺ zet het terug. Welke ingrediënten basis
          zijn, kies je bij het ingrediënt zelf.
        </p>
        <ul class="chips" aria-label="Basis">
          <li v-for="staple in pantry.staples" :key="staple.id">
            <button
              type="button"
              class="chip staple-chip"
              :class="{ out: !staple.present }"
              :aria-label="staple.present ? `${staple.name} is op` : `${staple.name} weer in huis`"
              :disabled="pantry.busy.has(staple.id)"
              @click="toggleStaple(staple)"
            >
              <span class="staple-name">{{ staple.name }}</span>
              <span aria-hidden="true">{{ staple.present ? '×' : '↺' }}</span>
            </button>
          </li>
        </ul>
      </details>

      <button v-if="!pantry.isDefault" type="button" class="reset" @click="resetToDefault">
        Terug naar standaard
      </button>
    </section>
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

.match-group + .match-group {
  margin-top: var(--space-5);
}

.section-title {
  margin-bottom: var(--space-2);
  font-size: var(--text-xl);
}

/* Het aantal als bolletje naast de titel, zodat "Mist 1" en het aantal niet samen "11" lijken. */
.group-count {
  display: inline-block;
  min-width: 1.5rem;
  margin-left: var(--space-2);
  padding: 0 var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.5rem;
  text-align: center;
  vertical-align: middle;
  color: var(--color-text-muted);
  background: var(--color-surface-hover);
  border-radius: var(--radius-full);
}

.matches {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Titel en "mist: …" links, de knop rechts; op een smal scherm de knop eronder. */
.match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.match + .match {
  border-top: 1px solid var(--color-border);
}

.match-text {
  flex: 1 1 12rem;
  min-width: 0;
}

.match-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.missing {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.add-missing {
  flex-shrink: 0;
  font-size: var(--text-sm);
}

.added {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success-text);
}

.stock {
  margin-top: var(--space-6);
}

.stock h2 {
  margin-bottom: var(--space-3);
}

.stock h3 {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.error {
  color: var(--color-error-text);
}

.small {
  font-size: var(--text-sm);
}

.field {
  margin-bottom: var(--space-2);
}

/* Chips die over meerdere regels doorlopen (geen scrollende rij: alles moet te zien zijn). */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap);
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  overflow-wrap: anywhere;
}

.add-chip {
  color: var(--color-accent-text);
  background: var(--color-surface);
}

/* In huis: gevuld, met een × om weg te halen. */
.present-chip {
  padding-right: var(--space-1);
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
}

.chip-remove {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
  color: inherit;
  background: none;
  border: 0;
  border-radius: var(--radius-full);
}

.chip-remove:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.staple-chip {
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
}

/* Op: doorgestreept en grijs, met ↺. */
.staple-chip.out {
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-style: dashed;
  border-color: var(--color-border-strong);
}

.staple-chip.out .staple-name {
  text-decoration: line-through;
}

.staples {
  margin-top: var(--space-4);
}

.staples summary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  list-style: none;
  cursor: pointer;
}

/* Een eigen pijltje: display: flex haalt dat van de browser weg. */
.staples summary::-webkit-details-marker {
  display: none;
}

.staples summary::before {
  content: '▸';
  width: 1rem;
}

.staples[open] summary::before {
  content: '▾';
}

.reset {
  margin-top: var(--space-5);
  font-size: var(--text-sm);
}
</style>
