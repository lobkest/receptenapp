<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { automaticTagLabels } from '@/utils/automaticTags'

const props = defineProps({
  recipe: { type: Object, required: true },
})

const MAX_TAGS = 3

// Een tag kan een kale string zijn ("snel") of een object ({ name: "snel" }).
function tagName(tag) {
  return typeof tag === 'string' ? tag : (tag?.name ?? '')
}

// Eerst de automatische tags (vegetarisch, ...), met een korte uitleg als er een wissel
// nodig is ("met tofu i.p.v. kip"), dan de tags die iemand zelf koos. Op de kaart is
// nooit iets gewisseld, dus de uitleg staat er altijd bij.
const tags = computed(() => [
  ...automaticTagLabels(props.recipe),
  ...(Array.isArray(props.recipe.tags) ? props.recipe.tags.map(tagName).filter(Boolean) : []).map(
    (name) => ({ name, hint: null }),
  ),
])
const visibleTags = computed(() => tags.value.slice(0, MAX_TAGS))
const hiddenTagCount = computed(() => tags.value.length - visibleTags.value.length)
</script>

<template>
  <RouterLink :to="`/recepten/${recipe.id}`" class="card recipe-card">
    <!-- Alleen met een foto een fotovak: zonder foto geen lege ruimte, de kaart wordt korter.
         alt="": de foto is decoratief, de titel staat eronder al als tekst. -->
    <div v-if="recipe.image_url" class="media">
      <img :src="recipe.image_url" alt="" loading="lazy" />
    </div>

    <div class="body">
      <!-- h3: op het overzicht staat het kopje van de sectie (h2) erboven. -->
      <h3 class="title">{{ recipe.title }}</h3>
      <ul v-if="tags.length" class="tags">
        <li
          v-for="(tag, index) in visibleTags"
          :key="index"
          class="tag"
          :class="{ 'tag-hint': tag.hint }"
          :title="tag.hint ? `${tag.name}: ${tag.hint}` : null"
        >
          {{ tag.name }}<span v-if="tag.hint" class="hint">{{ tag.hint }}</span>
        </li>
        <li v-if="hiddenTagCount > 0" class="tag tag-more">+{{ hiddenTagCount }}</li>
      </ul>
    </div>
  </RouterLink>
</template>

<style scoped>
/* De hele kaart is één link; .card geeft rand, achtergrond en ronde hoeken. */
.recipe-card {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  color: var(--color-text);
  text-decoration: none;
  transition:
    border-color var(--duration) ease,
    box-shadow var(--duration) ease;
}

.recipe-card:hover {
  color: var(--color-text);
  border-color: var(--color-brand);
  box-shadow: var(--shadow);
}

.media {
  aspect-ratio: 4 / 3;
  background: var(--color-surface-hover);
}

.media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
}

/* Maximaal twee regels, daarna een beletselteken. anywhere: ook een lange titel
   zonder spaties breekt af in plaats van de kaart op te rekken. */
.title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  margin: 0;
  font-size: var(--text-base);
  overflow-wrap: anywhere;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}

.tag {
  max-width: 100%;
  padding: 0 var(--space-2);
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-accent-text);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

/* Met een wissel: de uitleg klein eronder, en mag over twee regels. */
.tag-hint {
  display: flex;
  flex-direction: column;
  padding: 0.125rem var(--space-2);
  white-space: normal;
  border-radius: var(--radius-sm);
}

.hint {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  font-weight: 400;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.tag-more {
  color: var(--color-text-muted);
  background: var(--color-surface-hover);
}
</style>
