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

  <p v-if="store.loading && !store.hasRecipes">Recepten laden…</p>

  <div v-else-if="store.error" role="alert">
    <p>{{ store.error }}</p>
    <button type="button" @click="store.load()">Opnieuw proberen</button>
  </div>

  <p v-else-if="store.isEmpty">Er zijn nog geen recepten.</p>

  <ul v-else>
    <li v-for="recipe in store.recipes" :key="recipe.id">
      <RouterLink :to="`/recepten/${recipe.id}`">{{ recipe.title }}</RouterLink>
      <span class="servings">
        {{ recipe.servings }} {{ recipe.servings === 1 ? 'portie' : 'porties' }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
ul {
  list-style: none;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}

.servings {
  color: #666;
  white-space: nowrap;
}
</style>
