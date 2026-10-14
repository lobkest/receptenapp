<script setup>
// De bereiding op de receptpagina, genummerd zoals in een kookboek.
defineProps({
  // [{ id, position, body }], al op volgorde.
  steps: { type: Array, required: true },
})
</script>

<template>
  <section class="steps">
    <h2>Bereiding</h2>
    <ol>
      <li v-for="step in steps" :key="step.id">{{ step.body }}</li>
    </ol>
  </section>
</template>

<style scoped>
/* Grote groene nummers voor de stappen, als in een kookboek. */
.steps ol {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  position: relative;
  min-height: 2.5rem;
  margin-bottom: var(--space-4);
  padding-left: 3rem;
  counter-increment: step;
  /* Behoud enters uit de stappen. */
  white-space: pre-line;
}

.steps li::before {
  content: counter(step);
  position: absolute;
  top: -0.2rem;
  left: 0;
  width: 2.25rem;
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  color: var(--color-accent-text);
}
</style>
