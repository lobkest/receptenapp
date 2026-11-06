<script setup>
import { computed } from 'vue'
import { MAX_CARD_TAGS, cardTags } from '@/utils/sortRecipes'
import { tagIcon } from '@/utils/tagIcons'

// De binnenkant van een receptkaart: foto (als die er is), titel en tags. RecipeCard zet
// er de link omheen. De slot komt onder de tags, voor extra regels ("nog kopen: 2").
//
// Tags met een icoon (utils/tagIcons.js) staan er alleen als groen bolletje met het icoon;
// de naam staat in aria-label en title. Heeft de tag een wissel nodig ("met tofu i.p.v.
// kip"), dan krijgt het bolletje een amber stipje; de uitleg zelf staat op de receptpagina.
// Tags zonder icoon (vrij getypt) blijven een tekstpilletje, achter de iconen.
const props = defineProps({
  recipe: { type: Object, required: true },
})

const tags = computed(() => {
  const all = cardTags(props.recipe).map((tag) => ({ ...tag, icon: tagIcon(tag.name) }))
  return [...all.filter((tag) => tag.icon), ...all.filter((tag) => !tag.icon)]
})
const visibleTags = computed(() => tags.value.slice(0, MAX_CARD_TAGS))
const hiddenTagCount = computed(() => tags.value.length - visibleTags.value.length)

// Voor schermlezers: "vegetarisch, met wissel"; de tooltip toont de wissel zelf.
function tagLabel(tag) {
  return tag.hint ? `${tag.name}, met wissel` : tag.name
}

function tagTitle(tag) {
  return tag.hint ? `${tag.name}: ${tag.hint}` : tag.name
}
</script>

<template>
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
        :class="[tag.icon ? 'tag-icon' : 'tag-text', { 'tag-hint': tag.hint }]"
      >
        <!-- role="img" op een span, niet op de li: een li moet een lijstitem blijven. -->
        <span
          v-if="tag.icon"
          class="bubble"
          role="img"
          :aria-label="tagLabel(tag)"
          :title="tagTitle(tag)"
        >
          <component :is="tag.icon" :size="16" :stroke="2" aria-hidden="true" />
        </span>
        <span v-else :title="tag.hint ? tagTitle(tag) : null"
          >{{ tag.name }}<span v-if="tag.hint" class="visually-hidden">, met wissel</span></span
        >
      </li>
      <li v-if="hiddenTagCount > 0" class="tag tag-text tag-more">+{{ hiddenTagCount }}</li>
    </ul>
    <slot />
  </div>
</template>

<style scoped>
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
  font-family: var(--font-heading);
  font-size: var(--text-base);
  overflow-wrap: anywhere;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}

.tag {
  position: relative;
  max-width: 100%;
  flex-shrink: 0;
}

/* Het icoon in een rond groen bolletje. */
.bubble {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-radius: 50%;
}

.bubble svg {
  display: block;
}

/* Met wissel: een amber stipje rechtsboven, met een randje in de kaartkleur zodat het
   los van het bolletje te zien is. */
.tag-hint::after {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  content: '';
  background: var(--color-house-border);
  border: 1.5px solid var(--color-section);
  border-radius: 50%;
}

/* Een vrij getypte tag: een klein tekstpilletje, zoals vroeger. */
.tag-text {
  flex-shrink: 1;
  min-width: 0;
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

.tag-text.tag-hint {
  overflow: visible;
}

.tag-more {
  flex-shrink: 0;
  color: var(--color-text-muted);
  background: var(--color-row);
}
</style>
