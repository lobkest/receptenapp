<script setup>
import { RouterLink } from 'vue-router'

// De recepten op "In huis", in groepen: alles in huis, mist 1, mist 2 (PantryMatcher op de
// server). Per recept wat er mist, met "Ontbrekende op lijst". Het op de lijst zetten zelf
// (en de foutmelding) doet PantryView.
defineProps({
  // [{ missing_count, title, recipes: [{ id, title, servings, missing: [{ id, name }] }] }]
  groups: { type: Array, required: true },
  // Recept-id's die net op de lijst zijn gezet, en die nu worden opgeslagen.
  added: { type: Set, required: true },
  adding: { type: Set, required: true },
})

const emit = defineEmits(['add-missing'])
</script>

<template>
  <div class="recipe-groups">
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
              @click="emit('add-missing', recipe)"
            >
              Ontbrekende op lijst
            </button>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
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
</style>
