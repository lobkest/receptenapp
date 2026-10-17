<script setup>
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import RecipeDetailActions from '@/components/RecipeDetailActions.vue'
import RecipeDetailIngredients from '@/components/RecipeDetailIngredients.vue'
import RecipeDetailServings from '@/components/RecipeDetailServings.vue'
import RecipeDetailSteps from '@/components/RecipeDetailSteps.vue'
import RecipeDetailVariations from '@/components/RecipeDetailVariations.vue'
import RecipeNutrition from '@/components/RecipeNutrition.vue'
import { fetchRecipe } from '@/api/recipes'
import { provideConfirmDialog } from '@/composables/useConfirmDialog'
import { useRecipesStore } from '@/stores/recipes'
import { useShoppingListStore } from '@/stores/shoppingList'
import { formatSwaps, parseSwaps } from '@/utils/alternatives'
import { automaticTagLabels, needsDisclaimer } from '@/utils/automaticTags'

// De receptpagina. Deze view laadt het recept en houdt de staat die meerdere delen nodig
// hebben (het recept en het gekozen aantal porties); de delen zelf zijn componenten:
// RecipeDetailServings, -Ingredients, -Steps, -Variations en -Actions, en RecipeNutrition.

// Komt uit de route /recepten/:id dankzij props: true in de router.
const props = defineProps({
  id: { type: String, required: true },
})

const recipe = ref(null)
const loading = ref(false)
const notFound = ref(false)
const error = ref(null)

const recipes = useRecipesStore()
// Een melding van de vorige pagina, bijv. "… is opgeslagen." na bewerken.
const notice = ref(recipes.takeNotice())
// De bestaande tags zijn nodig voor "Tag erbij" bij de variaties.
onMounted(() => recipes.loadTags())

// Eén bevestigingsvenster voor de hele pagina (verwijderen van recept of variatie).
provideConfirmDialog(useTemplateRef('confirmDialog'))

// Porties: alleen het gekozen aantal is state; al het andere is daarvan afgeleid.
// Bewust niet bewaard: het is een keuze voor één keer koken, en bij een volgend bezoek
// begin je weer bij het recept zelf.
const servings = ref(null)

// Gewisselde ingrediënten ("⇄ tofu"): in de URL (?wissel=12:3), zodat herladen of een
// gedeelde link dezelfde keuze laat zien. Wat niet (meer) bij het recept hoort, telt niet.
// router.replace, geen push: wisselen is geen nieuwe pagina, "terug" gaat gewoon terug.
const route = useRoute()
const router = useRouter()
const swaps = computed(() => parseSwaps(route.query.wissel, recipe.value?.ingredients ?? []))

// Eerst de automatische tags (uitgerekend uit de ingrediënten), met de uitleg die nog
// geldt: wissel je kip voor tofu, dan verdwijnt "met tofu i.p.v. kip".
const automaticTags = computed(() =>
  recipe.value ? automaticTagLabels(recipe.value, swaps.value) : [],
)
const hasTags = computed(() => automaticTags.value.length > 0 || recipe.value?.tags?.length > 0)

function setSwaps(next) {
  const query = { ...route.query }
  delete query.wissel
  const wissel = formatSwaps(next, recipe.value?.ingredients ?? [])
  router.replace({ query: wissel ? { ...query, wissel } : query })
}

// De knoppen "+ lijst" / "✓ op lijst" lezen de boodschappenlijst uit de store. Die kan
// intussen elders veranderd zijn (ander apparaat, afgevinkt in de winkel), dus bij het
// openen van een recept halen we hem opnieuw op; terug naar de app ververst App.vue al.
// Lukt dat niet, dan blijft de laatste stand staan.
const shoppingList = useShoppingListStore()

// keepServings: na herladen (bijv. na een conflict) blijft de gekozen porties staan.
async function load(id, { keepServings = false } = {}) {
  const chosen = servings.value
  loading.value = true
  notFound.value = false
  error.value = null
  recipe.value = null
  try {
    const loaded = await fetchRecipe(id)
    loaded.variations ??= []
    recipe.value = loaded
    servings.value = keepServings && chosen ? chosen : loaded.servings
  } catch (e) {
    if (e.kind === 'not_found') {
      notFound.value = true
    } else {
      error.value = e.message
    }
  } finally {
    loading.value = false
  }
}

// Na een conflict bij een variatie: het recept opnieuw, met dezelfde porties.
function reload() {
  load(props.id, { keepServings: true })
}

// Van /recepten/1 naar /recepten/2 hergebruikt Vue hetzelfde component,
// dus onMounted draait niet opnieuw. Daarom kijken we naar het id zelf.
watch(() => props.id, load, { immediate: true })
watch(
  () => props.id,
  () => shoppingList.load().catch(() => {}),
  { immediate: true },
)
</script>

<template>
  <p v-if="loading" class="muted">Recept laden…</p>

  <div v-else-if="notFound">
    <h1>Recept niet gevonden</h1>
    <p>Dit recept bestaat niet (meer).</p>
  </div>

  <p v-else-if="error" class="notice notice-error" role="alert">{{ error }}</p>

  <article v-else-if="recipe">
    <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <!-- De categorie klein boven de titel; zonder categorie niets. -->
    <p v-if="recipe.category" class="category-label">{{ recipe.category.name }}</p>
    <h1>{{ recipe.title }}</h1>
    <ul v-if="hasTags" class="recipe-tags" aria-label="Tags">
      <li
        v-for="tag in automaticTags"
        :key="`auto-${tag.name}`"
        class="tag tag-automatic"
        :data-tag="tag.name"
      >
        {{ tag.name }}<span v-if="tag.hint" class="tag-hint"> · {{ tag.hint }}</span>
      </li>
      <li v-for="tag in recipe.tags" :key="tag" class="tag">{{ tag }}</li>
    </ul>
    <p v-if="needsDisclaimer(recipe)" class="tag-disclaimer muted">
      Op basis van eigen ingrediëntgegevens; controleer etiketten.
    </p>
    <RecipeDetailServings v-model="servings" :original="recipe.servings" />
    <p v-if="recipe.description" class="description">{{ recipe.description }}</p>

    <!-- Oudere recepten hebben geen ingrediënten of stappen; dan vervalt het kopje. -->
    <RecipeDetailIngredients
      v-if="recipe.ingredients?.length"
      :swaps="swaps"
      :recipe="recipe"
      :servings="servings"
      @update:swaps="setSwaps"
    />
    <RecipeDetailSteps v-if="recipe.steps?.length" :steps="recipe.steps" />
    <RecipeDetailVariations
      v-model:variations="recipe.variations"
      :recipe="recipe"
      :servings="servings"
      :swaps="swaps"
      @reload="reload"
    />
    <!-- Alleen als er minstens één ingrediënt meetelt. -->
    <RecipeNutrition
      v-if="recipe.nutrition?.counted > 0"
      :recipe="recipe"
      :servings="servings"
      :swaps="swaps"
    />
    <RecipeDetailActions :recipe="recipe" />
  </article>

  <ConfirmDialog ref="confirmDialog" />

  <p><RouterLink to="/" class="back-link">← Terug naar alle recepten</RouterLink></p>
</template>

<style scoped>
/* Behoud enters uit de beschrijving. */
.description {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  white-space: pre-line;
}

.category-label {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-accent-text);
  text-transform: uppercase;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  padding: 0;
  list-style: none;
}

/* Onder de tags, vóór de porties: klein, het is een kanttekening. */
.tag-disclaimer {
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  font-size: var(--text-xs);
}

/* De uitleg mag afbreken; de tag zelf blijft op één regel. */
.tag-automatic:has(.tag-hint) {
  white-space: normal;
  border-radius: var(--radius-sm);
}

.tag-hint {
  font-weight: 400;
}

/* Zoals de tags op de receptkaart. */
.tag {
  max-width: 100%;
  padding: 0 var(--space-2);
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-accent-text);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}
</style>
