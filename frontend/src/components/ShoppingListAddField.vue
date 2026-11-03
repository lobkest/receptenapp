<script setup>
import { computed, ref, useTemplateRef } from 'vue'
import { useIngredientList } from '@/composables/useIngredientNames'
import { findIngredients } from '@/utils/ingredientSearch'
import { parseLooseItem } from '@/utils/offlineShoppingList'

// "Iets toevoegen…" bovenaan de boodschappenlijst: typ, en Enter of + zet het erop. Het veld
// blijft daarna gefocust, zodat je snel het volgende typt. "3 uien" of "uien 3" is aantal 3
// (verder geen eenheden). Onder het veld staan bestaande ingrediënten als suggestie (ook
// offline, uit de snapshot): kies je er een, dan hoort de regel bij dat ingrediënt (optellen,
// "✓ op lijst" en "afgestreept = in huis" werken). Iets nieuws wordt vrije tekst, zonder
// nieuw ingrediënt. Heet wat je typt precies als een ingrediënt, dan telt dat als kiezen.
const emit = defineEmits(['add'])

const ingredientList = useIngredientList()
const text = ref('')
const input = useTemplateRef('input')

const parsed = computed(() => parseLooseItem(text.value))
const matches = computed(() => findIngredients(ingredientList.value, parsed.value.name))

function add(ingredient = null) {
  const { name, count } = parsed.value
  if (!name) return
  const exact = ingredient ?? ingredientList.value.find((i) => i.name === name.toLowerCase())
  emit('add', { name: exact?.name ?? name, ingredientId: exact?.id ?? null, count })
  text.value = ''
  input.value?.focus()
}
</script>

<template>
  <form class="add-field" @submit.prevent="add()">
    <div class="add-row">
      <input
        ref="input"
        v-model="text"
        class="add-input"
        type="text"
        enterkeyhint="done"
        autocomplete="off"
        placeholder="Iets toevoegen…"
        aria-label="Iets toevoegen aan de boodschappenlijst"
      />
      <button type="submit" class="add-button btn-primary" aria-label="Toevoegen">+</button>
    </div>
    <ul v-if="matches.length" class="chips suggestions" aria-label="Bestaande ingrediënten">
      <li v-for="ingredient in matches" :key="ingredient.id">
        <!-- mousedown.prevent: het veld houdt de focus (het toetsenbord blijft open). -->
        <button
          type="button"
          class="chip suggestion"
          :data-ingredient-id="ingredient.id"
          @mousedown.prevent
          @click="add(ingredient)"
        >
          + {{ parsed.count > 1 ? `${parsed.count} ` : '' }}{{ ingredient.name }}
        </button>
      </li>
    </ul>
  </form>
</template>

<style scoped>
.add-field {
  margin-bottom: var(--space-3);
}

.add-row {
  display: flex;
  gap: var(--space-2);
}

.add-input {
  flex: 1 1 auto;
  min-width: 0;
}

.add-button {
  flex: 0 0 auto;
  width: max(var(--tap), 44px);
  padding: 0;
  font-size: var(--text-lg);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  overflow-wrap: anywhere;
}
</style>
