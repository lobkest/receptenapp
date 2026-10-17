<script setup>
import { computed } from 'vue'
import { useRecipeFilter } from '@/composables/useRecipeFilter'
import { categoryChips } from '@/utils/categories'

// De filterchips boven een receptenlijst: één categorie tegelijk en zoveel tags als je
// wilt (een recept moet ze allemaal hebben). Gedeeld door het receptenoverzicht en
// "In huis"; het filter staat in de URL (useRecipeFilter).
const props = defineProps({
  // Alle categorieën op volgorde: [{ id, name, position }].
  categories: { type: Array, required: true },
  // De recepten waar de chips bij horen: voor categorieën die nog niet in de lijst staan,
  // en voor "Overig" (alleen als er recepten zonder categorie zijn).
  recipes: { type: Array, required: true },
  // Alle tags met hun aantal: [{ name, count }].
  tags: { type: Array, required: true },
})

const { selectedTags, selectedCategory, hasFilters, selectCategory, toggleTag, clearFilters } =
  useRecipeFilter()

const categoryFilterChips = computed(() =>
  categoryChips(props.categories, props.recipes, selectedCategory.value),
)

// Alle tags met hun aantal, plus een gekozen tag die (niet meer) in /api/tags staat,
// bijv. uit een oude link: die moet je ook weer uit kunnen zetten.
const tagChips = computed(() => {
  const known = props.tags.map((tag) => tag.name)
  const unknown = selectedTags.value
    .filter((name) => !known.includes(name))
    .map((name) => ({ name, count: null }))
  return [...props.tags, ...unknown]
})
</script>

<template>
  <div v-if="categoryFilterChips.length > 1 || tagChips.length" class="filter">
    <!-- Eén categorie tegelijk ("Alles" is geen filter). Bij veel chips scrolt alleen
         de rij opzij, niet de hele pagina. Alleen "Alles" (nog niets geladen) is geen rij. -->
    <div
      v-if="categoryFilterChips.length > 1"
      class="chip-row category-chips"
      role="group"
      aria-label="Filter op categorie"
    >
      <button
        v-for="chip in categoryFilterChips"
        :key="chip.key ?? 'alles'"
        type="button"
        class="filter-chip category-chip"
        :aria-pressed="chip.key === selectedCategory"
        @click="selectCategory(chip.key)"
      >
        {{ chip.name }}
      </button>
    </div>

    <!-- Tags: meerdere tegelijk, een recept moet ze allemaal hebben. -->
    <div v-if="tagChips.length" class="chip-row tag-chips" role="group" aria-label="Filter op tag">
      <button
        v-for="tag in tagChips"
        :key="tag.name"
        type="button"
        class="filter-chip"
        :aria-pressed="selectedTags.includes(tag.name)"
        @click="toggleTag(tag.name)"
      >
        {{ tag.name }}
        <span v-if="tag.count != null" class="count">{{ tag.count }}</span>
      </button>
    </div>
    <button v-if="hasFilters" type="button" class="clear-filters" @click="clearFilters">
      Wis filters
    </button>
  </div>
</template>

<style scoped>
.filter {
  margin-bottom: var(--space-4);
}

/* Eén regel chips die opzij scrolt. De negatieve marge laat de rij tot de rand van het
   scherm lopen (over de zijmarge van <main>); de padding houdt de eerste chip op zijn plek. */
.chip-row {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-4));
  padding: var(--space-1) var(--space-4);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

/* Tags onder de categorieën, met wat lucht ertussen. */
.tag-chips {
  margin-top: var(--space-1);
}

.filter-chip {
  flex-shrink: 0;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
}

/* Categorieën: één keuze, iets steviger dan de tags, zodat de twee rijen niet op
   elkaar lijken. */
.category-chip {
  font-weight: 600;
  color: var(--color-text);
}

.filter-chip[aria-pressed='true'] {
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.filter-chip[aria-pressed='true']:hover {
  color: var(--color-on-brand);
  background: var(--color-brand-strong);
}

.count {
  font-weight: 400;
  opacity: 0.8;
}

.clear-filters {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}
</style>
