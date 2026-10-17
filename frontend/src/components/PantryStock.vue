<script setup>
import { computed } from 'vue'
import IngredientSearchField from '@/components/IngredientSearchField.vue'
import { usePantryStore } from '@/stores/pantry'

// De voorraad op "In huis": zoeken en in huis zetten, wat er (behalve de basis) in huis is,
// de snelkeuze en de basis (op of weer in huis). Wat een tik doet (de server, en de
// foutmelding) regelt PantryView via de events.
defineProps({
  // Een melding bij de laatste actie (de server weigert, geen netwerk), of null.
  error: { type: String, default: null },
})

const emit = defineEmits(['put', 'remove', 'toggle-staple', 'reset'])

const pantry = usePantryStore()

// Wat al in huis is, hoeft het zoekveld niet meer te vinden.
const inHouseIds = computed(
  () =>
    new Set([
      ...pantry.inHouse.map((item) => item.id),
      ...pantry.staples.filter((staple) => staple.present).map((staple) => staple.id),
    ]),
)

const outCount = computed(() => pantry.staples.filter((staple) => !staple.present).length)
</script>

<template>
  <section class="stock card" aria-labelledby="stock-title">
    <h2 id="stock-title">Voorraad</h2>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <IngredientSearchField
      id="pantry-search"
      label="Ingrediënt in huis zetten"
      placeholder="zoek een ingrediënt"
      empty-text="Geen ingrediënt gevonden dat nog niet in huis is."
      :exclude="inHouseIds"
      @choose="(ingredient) => emit('put', ingredient)"
    />

    <h3>In huis</h3>
    <ul v-if="pantry.inHouse.length" class="chips in-house" aria-label="In huis">
      <li v-for="item in pantry.inHouse" :key="item.id">
        <span class="chip present-chip">
          {{ item.name }}
          <button
            type="button"
            class="chip-remove"
            :aria-label="`${item.name} weghalen`"
            :disabled="pantry.busy.has(item.id)"
            @click="emit('remove', item)"
          >
            ×
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="muted small">Behalve de basis nog niets.</p>

    <template v-if="pantry.suggestions.length">
      <h3>Snelkeuze</h3>
      <ul class="chips quick-picks" aria-label="Snelkeuze">
        <li v-for="item in pantry.suggestions" :key="item.id">
          <button
            type="button"
            class="chip add-chip"
            :disabled="pantry.busy.has(item.id)"
            @click="emit('put', item)"
          >
            + {{ item.name }}
          </button>
        </li>
      </ul>
    </template>

    <details v-if="pantry.staples.length" class="staples">
      <summary>
        Basis
        <span class="muted"
          >({{ pantry.staples.length
          }}<template v-if="outCount">, {{ outCount }} op</template>)</span
        >
      </summary>
      <p class="muted small">
        Staat standaard in huis. Tik als iets op is; ↺ zet het terug. Welke ingrediënten basis zijn,
        kies je bij het ingrediënt zelf.
      </p>
      <ul class="chips" aria-label="Basis">
        <li v-for="staple in pantry.staples" :key="staple.id">
          <button
            type="button"
            class="chip staple-chip"
            :class="{ out: !staple.present }"
            :aria-label="staple.present ? `${staple.name} is op` : `${staple.name} weer in huis`"
            :disabled="pantry.busy.has(staple.id)"
            @click="emit('toggle-staple', staple)"
          >
            <span class="staple-name">{{ staple.name }}</span>
            <span aria-hidden="true">{{ staple.present ? '×' : '↺' }}</span>
          </button>
        </li>
      </ul>
    </details>

    <button v-if="!pantry.isDefault" type="button" class="reset" @click="emit('reset')">
      Terug naar standaard
    </button>
  </section>
</template>

<style scoped>
.stock {
  margin-top: var(--space-6);
}

.stock h2 {
  margin-bottom: var(--space-3);
}

.stock h3 {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.error {
  color: var(--color-error-text);
}

.small {
  font-size: var(--text-sm);
}

/* Zoals vóór het gedeelde zoekveld: "niets gevonden" met wat meer ruimte eromheen. */
.ingredient-search :deep(.empty) {
  margin: var(--space-2) 0 var(--space-4);
}

/* Chips die over meerdere regels doorlopen (geen scrollende rij: alles moet te zien zijn). */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap);
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  overflow-wrap: anywhere;
}

.add-chip {
  color: var(--color-accent-text);
  background: var(--color-surface);
}

/* In huis: gevuld, met een × om weg te halen. */
.present-chip {
  padding-right: var(--space-1);
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
}

.chip-remove {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0;
  font-size: var(--text-lg);
  line-height: 1;
  color: inherit;
  background: none;
  border: 0;
  border-radius: var(--radius-full);
}

.chip-remove:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.staple-chip {
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
}

/* Op: doorgestreept en grijs, met ↺. */
.staple-chip.out {
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-style: dashed;
  border-color: var(--color-border-strong);
}

.staple-chip.out .staple-name {
  text-decoration: line-through;
}

.staples {
  margin-top: var(--space-4);
}

.staples summary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--tap);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  list-style: none;
  cursor: pointer;
}

/* Een eigen pijltje: display: flex haalt dat van de browser weg. */
.staples summary::-webkit-details-marker {
  display: none;
}

.staples summary::before {
  content: '▸';
  width: 1rem;
}

.staples[open] summary::before {
  content: '▾';
}

.reset {
  margin-top: var(--space-5);
  font-size: var(--text-sm);
}
</style>
