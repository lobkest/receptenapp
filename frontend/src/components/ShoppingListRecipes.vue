<script setup>
import { RouterLink } from 'vue-router'

// Het vakje "Recepten op je lijst" onderaan de boodschappenlijst: per recept het aantal open
// regels en een knop om die allemaal weg te halen (de pagina vraagt eerst om bevestiging).
// In de kop de schakelaar "Groepeer per recept"; die stand staat in de URL (?groep=recept),
// dus de pagina beheert hem en wij melden alleen de wijziging (v-model:grouped).
defineProps({
  // Rijen van recipesOnList (src/utils/shoppingListRecipes.js).
  recipes: { type: Array, required: true },
  grouped: { type: Boolean, default: false },
  // Offline kan verwijderen niet; groeperen wel.
  offline: { type: Boolean, default: false },
})

const emit = defineEmits(['update:grouped', 'remove'])

function itemsText(count) {
  return count === 1 ? '1 item' : `${count} items`
}
</script>

<template>
  <section class="list-recipes card" aria-labelledby="list-recipes-title">
    <div class="head">
      <h2 id="list-recipes-title">Recepten op je lijst</h2>
      <label class="group-toggle">
        <input
          type="checkbox"
          :checked="grouped"
          @change="emit('update:grouped', $event.target.checked)"
        />
        Groepeer per recept
      </label>
    </div>

    <ul>
      <li v-for="recipe in recipes" :key="recipe.key" :data-key="recipe.key">
        <RouterLink
          v-if="recipe.linkable"
          class="name"
          :to="{ name: 'recipe', params: { id: recipe.recipeId } }"
          >{{ recipe.title }}</RouterLink
        >
        <span v-else class="name">{{ recipe.title }}</span>
        <span class="count">{{ itemsText(recipe.openCount) }}</span>
        <button
          type="button"
          class="remove-recipe"
          :disabled="offline"
          :aria-label="`Alles van ${recipe.title} verwijderen`"
          @click="emit('remove', recipe)"
        >
          <span aria-hidden="true">🗑</span> Verwijder
        </button>
      </li>
    </ul>

    <p v-if="offline" class="offline-hint">Verwijderen kan alleen online.</p>
  </section>
</template>

<style scoped>
.list-recipes {
  margin-top: var(--space-5);
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.head h2 {
  margin: 0;
  font-size: var(--text-lg);
}

.group-toggle {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--tap);
  margin: 0;
  font-weight: 400;
  font-size: var(--text-sm);
  cursor: pointer;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  border-top: 1px solid var(--color-border);
}

.name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.remove-recipe {
  flex-shrink: 0;
  padding: 0 var(--space-2);
  color: var(--color-text-muted);
  background: transparent;
  border-color: transparent;
  font-size: var(--text-sm);
}

.offline-hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
