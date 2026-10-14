<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  recipe: { type: Object, required: true },
})

const MAX_TAGS = 2

// Een tag kan een kale string zijn ("vegetarisch") of een object ({ name: "vegetarisch" }).
function tagName(tag) {
  return typeof tag === 'string' ? tag : (tag?.name ?? '')
}

const tags = computed(() =>
  Array.isArray(props.recipe.tags) ? props.recipe.tags.map(tagName).filter(Boolean) : [],
)
const visibleTags = computed(() => tags.value.slice(0, MAX_TAGS))
const hiddenTagCount = computed(() => tags.value.length - visibleTags.value.length)
</script>

<template>
  <RouterLink :to="`/recepten/${recipe.id}`" class="card recipe-card">
    <div class="media">
      <!-- alt="": de foto is decoratief, de titel staat eronder al als tekst. -->
      <img v-if="recipe.image_url" :src="recipe.image_url" alt="" loading="lazy" />
      <div v-else class="placeholder" data-test="placeholder" aria-hidden="true">
        <!-- Een kom met stoom: rustig, en past bij elk recept. -->
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3 11h18a9 9 0 0 1-18 0Z" />
          <path d="M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4M16 3c-1 1.5 1 2.5 0 4" />
        </svg>
      </div>
    </div>

    <div class="body">
      <h2 class="title">{{ recipe.title }}</h2>
      <p class="servings">
        {{ recipe.servings }} {{ recipe.servings === 1 ? 'portie' : 'porties' }}
      </p>
      <ul v-if="tags.length" class="tags">
        <li v-for="(tag, index) in visibleTags" :key="index" class="tag">{{ tag }}</li>
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
  height: 100%;
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

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
}

.placeholder svg {
  width: 40%;
  max-width: 4rem;
  height: auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
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

.servings {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
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

.tag-more {
  color: var(--color-text-muted);
  background: var(--color-surface-hover);
}
</style>
