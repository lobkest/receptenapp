import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Het receptfilter (categorie en tags), gedeeld door het receptenoverzicht en "In huis".
// Het staat in de URL (?tags=vegetarisch,snel&category=3), niet in een store. Zo kom je
// met "terug" vanaf een recept weer bij hetzelfde filter, en kun je een gefilterde lijst
// delen. Elke pagina heeft zo haar eigen filter.
export function useRecipeFilter() {
  const route = useRoute()
  const router = useRouter()

  const selectedTags = computed(() =>
    String(route.query.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )

  // ?category=3, of ?category=overig voor recepten zonder categorie. Zonder: "Alles".
  const selectedCategory = computed(() =>
    route.query.category ? String(route.query.category) : null,
  )

  // replace, geen push: aan- en uitzetten van filters vult de geschiedenis niet, dus
  // "terug" brengt je naar de vorige pagina, niet naar het vorige filter.
  function setTags(tags) {
    router.replace({ query: { ...route.query, tags: tags.length ? tags.join(',') : undefined } })
  }

  function selectCategory(key) {
    router.replace({ query: { ...route.query, category: key ?? undefined } })
  }

  function toggleTag(name) {
    setTags(
      selectedTags.value.includes(name)
        ? selectedTags.value.filter((tag) => tag !== name)
        : [...selectedTags.value, name],
    )
  }

  // "Wis filters": tags en categorie, terug naar alles.
  function clearFilters() {
    router.replace({ query: { ...route.query, tags: undefined, category: undefined } })
  }

  return { selectedTags, selectedCategory, selectCategory, toggleTag, clearFilters }
}
