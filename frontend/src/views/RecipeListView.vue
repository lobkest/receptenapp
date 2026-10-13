<script setup>
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useRecipesStore } from '@/stores/recipes'

const store = useRecipesStore()

// Altijd verversen; een eerder geladen lijst blijft zichtbaar tot de nieuwe binnen is.
onMounted(() => store.load())
</script>

<template>
  <h1>Recepten</h1>

  <p v-if="store.loading && !store.hasRecipes" class="muted">Recepten laden…</p>

  <div v-else-if="store.error" class="notice notice-error" role="alert">
    <p>{{ store.error }}</p>
    <button type="button" class="btn-primary" @click="store.load()">Opnieuw proberen</button>
  </div>

  <p v-else-if="store.isEmpty" class="muted">Er zijn nog geen recepten.</p>

  <ul v-else class="recipe-list">
    <li v-for="recipe in store.recipes" :key="recipe.id" class="card recipe-card">
      <RouterLink :to="`/recepten/${recipe.id}`" class="recipe-link">{{ recipe.title }}</RouterLink>
      <span class="servings">
        {{ recipe.servings }} {{ recipe.servings === 1 ? 'portie' : 'porties' }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
.recipe-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* De hele kaart is aanklikbaar: het ::after-vlak van de link ligt over de kaart. */
.recipe-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 4rem;
  transition:
    border-color var(--duration) ease,
    box-shadow var(--duration) ease;
}

.recipe-card:hover {
  border-color: var(--color-brand);
  box-shadow: var(--shadow);
}

.recipe-link {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
}

.recipe-link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
}

/* De focusrand om de hele kaart, niet alleen om de titel. */
.recipe-link:focus-visible {
  outline: none;
}

.recipe-link:focus-visible::after {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.servings {
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}
</style>
