<script setup>
// Een zachte kaart om een deel van een formulier: een beige vlak met een kop (titel links,
// meta rechts, bijv. "3 ingrediënten") en de inhoud eronder. Binnenin staan vaak blokken
// (ingrediënt- of stapregels) in --color-row.
//
// as: 'fieldset' (standaard) als de inhoud een groep velden is; de titel is dan de
// <legend>, zodat een schermlezer bij elk veld hoort bij welke groep het hoort.
// 'section' voor een deel met eigen labels (de titel is dan een <h2>).
// Een class op <SectionCard> komt op het buitenste element (fieldset of section).
defineProps({
  title: { type: String, required: true },
  meta: { type: String, default: null },
  as: { type: String, default: 'fieldset', validator: (v) => ['fieldset', 'section'].includes(v) },
})
</script>

<template>
  <component :is="as" class="section-card">
    <!-- De legend moet het eerste kind van de fieldset zijn, anders is hij niet de naam van
         de groep. De meta staat er los naast: de naam blijft kort ("Ingrediënten"). -->
    <legend v-if="as === 'fieldset'" class="section-title">{{ title }}</legend>
    <h2 v-else class="section-title">{{ title }}</h2>
    <span v-if="meta" class="section-meta">{{ meta }}</span>
    <div class="section-body">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.section-card {
  min-width: 0;
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  background: var(--color-section);
  border: 1px solid var(--color-section-border);
  border-radius: var(--radius-xl);
}

/* float: een legend staat anders óp de rand van de fieldset. Titel links, meta rechts,
   de inhoud eronder (clear). */
.section-title {
  float: left;
  margin: 0;
  padding: 0;
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.3;
}

.section-meta {
  float: right;
  font-size: var(--text-sm);
  line-height: calc(var(--text-lg) * 1.3);
  color: var(--color-text-muted);
}

.section-body {
  clear: both;
  padding-top: var(--space-2);
}
</style>
