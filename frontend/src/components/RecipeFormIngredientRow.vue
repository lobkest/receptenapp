<script setup>
import IngredientSuggestion from '@/components/IngredientSuggestion.vue'
import { UNITS } from '@/utils/quantity'

// Eén ingrediëntregel van RecipeForm: naam, hoeveelheid, eenheid, optioneel en ×, met de
// alternatieven ("of: tofu") eronder. De regel zelf (v-model:row) is een object uit de
// lijst van RecipeForm; de velden passen dat object aan. Toevoegen en weghalen (van de
// regel of een alternatief) doet RecipeForm, want die houdt de keys en de weggehaalde
// id's bij.
const props = defineProps({
  // De plek in het formulier, vanaf 0 (voor de labels: "ingrediënt 1").
  index: { type: Number, required: true },
  // De enige regel kan niet weg.
  removable: { type: Boolean, default: true },
  // Alle bestaande ingrediëntnamen, voor "Bedoel je: …?".
  names: { type: Array, required: true },
  // Welke velden de server fout vond: { quantity: true, 'alternatives[1].unit': true }.
  invalid: { type: Object, default: () => ({}) },
  // De keys van de alternatieven zoals ze in de laatst verstuurde request stonden, om
  // "alternatives[1].quantity" bij het goede alternatief te zetten.
  sentAlternativeKeys: { type: Array, default: () => [] },
  // De meldingen van de server voor deze regel.
  messages: { type: Array, default: () => [] },
})

const row = defineModel('row', { type: Object, required: true })

const emit = defineEmits(['remove', 'add-alternative', 'remove-alternative'])

function isAlternativeInvalid(alternative, field) {
  const index = props.sentAlternativeKeys.indexOf(alternative.key)
  return index >= 0 && !!props.invalid[`alternatives[${index}].${field}`]
}
</script>

<template>
  <div class="row ingredient-row" :data-key="row.key">
    <div class="inputs">
      <input
        v-model="row.ingredient_name"
        type="text"
        class="name"
        placeholder="bijv. bloem"
        :aria-label="`Naam ingrediënt ${index + 1}`"
        :aria-invalid="!!invalid.ingredient_name"
      />
      <input
        v-model="row.quantity"
        type="text"
        inputmode="decimal"
        class="quantity"
        :aria-label="`Hoeveelheid ingrediënt ${index + 1}`"
        :aria-invalid="!!invalid.quantity"
      />
      <select
        v-model="row.unit"
        class="unit"
        :aria-label="`Eenheid ingrediënt ${index + 1}`"
        :aria-invalid="!!invalid.unit"
      >
        <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
      </select>
      <!-- Het hele label is het tikvlak (min. --tap×--tap), niet alleen het vakje. -->
      <label class="optional">
        <input v-model="row.optional" type="checkbox" />
        optioneel
      </label>
      <button
        type="button"
        class="remove btn-danger"
        :disabled="!removable"
        :aria-label="`Ingrediënt ${index + 1} verwijderen`"
        @click="emit('remove')"
      >
        ×
      </button>
    </div>
    <IngredientSuggestion
      :name="row.ingredient_name"
      :names="names"
      @use="row.ingredient_name = $event"
    />
    <!-- Alternatieven ("of: tofu"): ingeklapt achter "+ alternatief". -->
    <div
      v-for="(alternative, altIndex) in row.alternatives"
      :key="alternative.key"
      class="alternative"
      :data-key="alternative.key"
    >
      <span class="of" aria-hidden="true">of</span>
      <input
        v-model="alternative.ingredient_name"
        type="text"
        class="alt-name"
        placeholder="bijv. tofu"
        :aria-label="`Alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
        :aria-invalid="isAlternativeInvalid(alternative, 'ingredient_name')"
      />
      <input
        v-model="alternative.quantity"
        type="text"
        inputmode="decimal"
        class="alt-quantity"
        placeholder="zelfde als origineel"
        :aria-label="`Hoeveelheid alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
        :aria-invalid="isAlternativeInvalid(alternative, 'quantity')"
      />
      <!-- Zonder hoeveelheid geldt die van het origineel, en telt de eenheid niet. -->
      <select
        v-model="alternative.unit"
        class="alt-unit"
        :disabled="!alternative.quantity.trim()"
        :aria-label="`Eenheid alternatief ${altIndex + 1} voor ingrediënt ${index + 1}`"
        :aria-invalid="isAlternativeInvalid(alternative, 'unit')"
      >
        <option v-for="unit in UNITS" :key="unit" :value="unit">{{ unit }}</option>
      </select>
      <button
        type="button"
        class="alt-remove"
        :aria-label="`Alternatief ${altIndex + 1} voor ingrediënt ${index + 1} verwijderen`"
        @click="emit('remove-alternative', altIndex)"
      >
        ×
      </button>
      <!-- Dezelfde "Bedoel je: …?" als bij de naam van het ingrediënt. -->
      <IngredientSuggestion
        class="alt-suggestion"
        :name="alternative.ingredient_name"
        :names="names"
        @use="alternative.ingredient_name = $event"
      />
    </div>
    <button
      type="button"
      class="add-alternative"
      :aria-label="`Alternatief voor ingrediënt ${index + 1} toevoegen`"
      @click="emit('add-alternative')"
    >
      + alternatief
    </button>
    <p v-for="message in messages" :key="message" class="error">
      {{ message }}
    </p>
  </div>
</template>

<style scoped>
.row .error {
  margin-top: var(--space-1);
}

/* clear: onder de legend van RecipeForm, die float: left heeft (anders botst de eerste
   regel ermee). */
.row {
  clear: both;
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border);
}

.row:last-child {
  border-bottom: 0;
}

/* Mobiel: de naam over de hele breedte; daaronder hoeveelheid, eenheid, optioneel en ×. */
.inputs {
  display: grid;
  /* De eenheid minstens zo breed dat "stuks" helemaal zichtbaar is. */
  grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 1fr) auto auto;
  gap: var(--space-2);
  align-items: center;
}

.inputs .name {
  grid-column: 1 / -1;
}

/* Mogen smaller worden dan hun standaardbreedte, anders past de rij niet op 390 px. */
.inputs .quantity,
.inputs .unit {
  min-width: 0;
}

.inputs .unit {
  padding-right: var(--space-1);
}

.optional {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 var(--space-1);
  font-size: var(--text-sm);
  font-weight: 400;
  cursor: pointer;
}

.inputs .remove {
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  line-height: 1;
}

/* Breed: alles op één regel. */
@media (min-width: 40rem) {
  .inputs {
    grid-template-columns: 1fr 6rem 6rem auto auto;
  }

  .inputs .name {
    grid-column: auto;
  }
}

/* Een alternatief: ingesprongen onder zijn ingrediënt, met "of" ervoor. Mobiel de naam
   (en ×) op de eerste regel, hoeveelheid en eenheid eronder. */
.alternative {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 5.5rem var(--tap);
  gap: var(--space-1) var(--space-2);
  align-items: center;
  margin-top: var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--color-brand-soft);
}

.alternative .of {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.alternative .alt-name {
  grid-column: 2 / 4;
}

.alternative .alt-quantity {
  grid-column: 2;
}

.alternative .alt-quantity,
.alternative .alt-unit {
  min-width: 0;
}

.alternative .alt-quantity::placeholder {
  font-size: var(--text-sm);
}

.alternative .alt-unit {
  padding-right: var(--space-1);
}

.alternative .alt-unit:disabled {
  opacity: 0.5;
}

.alternative .alt-suggestion {
  grid-column: 2 / -1;
  margin: 0;
}

.alternative .alt-remove {
  grid-row: 1;
  grid-column: 4;
  width: var(--tap);
  padding: 0;
  font-size: var(--text-xl);
  line-height: 1;
  color: var(--color-text-muted);
}

/* Klein en licht: de meeste ingrediënten hebben geen alternatief. Wel een volledig
   tikvlak (--tap hoog), zoals elke knop. */
.add-alternative {
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-accent-text);
  background: transparent;
  border: 0;
}

@media (min-width: 40rem) {
  .alternative {
    grid-template-columns: auto minmax(0, 1fr) 10rem 6rem var(--tap);
  }

  .alternative .alt-name,
  .alternative .alt-quantity {
    grid-column: auto;
  }

  .alternative .alt-remove {
    grid-row: auto;
    grid-column: auto;
  }
}
</style>
