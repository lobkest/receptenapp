<script setup>
import { onMounted } from 'vue'
import RecipeCard from '@/components/RecipeCard.vue'
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

  <ul v-else class="recipe-grid">
    <li v-for="recipe in store.recipes" :key="recipe.id">
      <RecipeCard :recipe="recipe" />
    </li>
  </ul>
</template>

<style scoped>
/* Twee kolommen op de telefoon, drie vanaf 640px (40rem), vier vanaf 1024px (64rem).
   minmax(0, 1fr): een kolom mag smaller worden dan zijn inhoud, dus niets loopt over. */
.recipe-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 40rem) {
  .recipe-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

@media (min-width: 64rem) {
  .recipe-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
