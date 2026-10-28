<script setup>
import { computed } from 'vue'
import { splitLinks } from '@/utils/links'

// Tekst waarin links klikbaar zijn, bijv. een bron in de beschrijving van een recept.
// Geen v-html: Vue maakt zelf de <a>-elementen, dus de rest blijft gewone tekst.
const props = defineProps({
  text: { type: String, required: true },
})

const parts = computed(() => splitLinks(props.text))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{
      part.text
    }}</a>
    <template v-else>{{ part.text }}</template>
  </template>
</template>
