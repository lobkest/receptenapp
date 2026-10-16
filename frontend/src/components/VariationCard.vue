<script setup>
import { computed } from 'vue'
import { formatQuantity, scaleQuantity } from '@/utils/quantity'

// Eén variatie op de receptpagina. Wat eraf gaat staat in rood met "−" en doorgestreept,
// wat erbij komt in groen met "+". Het teken is gewone tekst, dus het verschil is ook
// zonder kleur te zien (en voor een schermlezer te horen).
const props = defineProps({
  // Zoals de API hem stuurt: { id, name, notes, changes, tag_changes }.
  variation: { type: Object, required: true },
  // Gekozen porties gedeeld door die van het recept: de extra hoeveelheden schalen mee.
  factor: { type: Number, default: 1 },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['add-to-list', 'edit', 'delete'])

const removals = computed(() => props.variation.changes.filter((c) => c.kind === 'remove'))

const additions = computed(() =>
  props.variation.changes
    .filter((c) => c.kind === 'add')
    .map((c) => ({ ...c, quantity: scaleQuantity(c.quantity, props.factor, c.unit) })),
)

// "150 g kip"; zonder hoeveelheid alleen de naam ("peper").
function additionText(addition) {
  if (addition.quantity == null) return addition.name
  return `${formatQuantity(addition.quantity)} ${addition.unit} ${addition.name}`
}
</script>

<template>
  <article class="card variation-card" :data-id="variation.id">
    <h3>{{ variation.name }}</h3>

    <ul v-if="variation.changes.length" class="changes" aria-label="Ingrediënten">
      <li v-for="removal in removals" :key="removal.id" class="change removed">
        − <s>{{ removal.name }}</s>
      </li>
      <li v-for="addition in additions" :key="addition.id" class="change added">
        + {{ additionText(addition) }}
      </li>
    </ul>

    <p v-if="variation.notes" class="notes">{{ variation.notes }}</p>

    <ul v-if="variation.tag_changes.length" class="tag-changes" aria-label="Tags">
      <li
        v-for="change in variation.tag_changes"
        :key="`${change.kind}-${change.tag}`"
        class="tag-change"
        :class="change.kind === 'add' ? 'added' : 'removed'"
        :title="change.kind === 'add' ? `tag ${change.tag} erbij` : `tag ${change.tag} eraf`"
      >
        {{ change.kind === 'add' ? '+' : '−' }} {{ change.tag }}
      </li>
    </ul>

    <div class="actions">
      <button
        type="button"
        class="add-to-list btn-primary"
        :disabled="busy"
        @click="emit('add-to-list', variation)"
      >
        Variatie op lijst
      </button>
      <button type="button" class="edit" :disabled="busy" @click="emit('edit', variation)">
        Bewerken
      </button>
      <button
        type="button"
        class="delete btn-danger"
        :disabled="busy"
        @click="emit('delete', variation)"
      >
        Verwijderen
      </button>
    </div>
  </article>
</template>

<style scoped>
/* Smal (twee kolommen op een telefoon): alles onder elkaar, lange woorden breken af. */
.variation-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-3);
  overflow-wrap: anywhere;
}

h3 {
  margin: 0;
  font-size: var(--text-base);
}

.changes,
.tag-changes {
  margin: 0;
  padding: 0;
  list-style: none;
}

.change {
  font-size: var(--text-sm);
  line-height: 1.4;
}

.added {
  color: var(--color-success-text);
}

.removed {
  color: var(--color-error-text);
}

.notes {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: pre-line;
}

.tag-changes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

/* Dezelfde vorm als de tags op de receptkaart, met een eigen achtergrond per soort. */
.tag-change {
  max-width: 100%;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  border-radius: var(--radius-full);
}

.tag-change.added {
  background: var(--color-success-soft);
}

.tag-change.removed {
  background: var(--color-error-soft);
}

/* Knoppen over de hele breedte van de kaart; met margin-top: auto onderaan uitgelijnd. */
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-1);
}

.actions button {
  width: 100%;
  padding-inline: var(--space-2);
  font-size: var(--text-sm);
}
</style>
