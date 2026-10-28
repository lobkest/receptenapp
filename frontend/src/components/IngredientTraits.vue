<script setup>
import { computed, ref, watch } from 'vue'
import { useTraitSaver } from '@/composables/useTraitSaver'
import { automaticTagList, toggleTrait, traitConsequence } from '@/utils/traits'

// De kenmerken van een ingrediënt (vlees, gluten, ...) op het bewerkscherm. Los van het
// NEVO-formulier: elk vinkje wordt meteen opgeslagen (PATCH .../traits), zonder
// lock_version, dus een open NEVO-formulier krijgt daar geen conflict door.
const props = defineProps({
  // Het ingrediënt zoals /api/ingredients/:id het geeft (traits, traits_checked).
  ingredient: { type: Object, required: true },
  // Alle kenmerken, zoals /api/traits ze geeft; de view haalt ze één keer op.
  traits: { type: Array, required: true },
  // Lukte dat ophalen niet: de melding.
  loadError: { type: String, default: null },
})

// Na opslaan: { traits, traits_checked } zoals de server ze nu heeft.
const emit = defineEmits(['saved'])

const traitNames = ref([])
const traitError = ref(null)
const traitMessage = ref(null)
const traitSaver = useTraitSaver()

// Opnieuw van de server (laden, opslaan van het formulier): de vinkjes volgen.
watch(
  () => props.ingredient.traits,
  (names) => (traitNames.value = [...(names ?? [])]),
  { immediate: true },
)

watch(
  () => props.loadError,
  (message) => (traitError.value = message),
  { immediate: true },
)

const consequence = computed(() => traitConsequence(traitNames.value, props.traits))
const tagList = computed(() => automaticTagList(props.traits))

async function saveTraits(fields, done) {
  traitError.value = null
  traitMessage.value = null
  try {
    const { result, latest } = await traitSaver.save(props.ingredient.id, fields)
    if (!latest) return
    traitNames.value = [...result.traits]
    emit('saved', { traits: result.traits, traits_checked: result.traits_checked })
    traitMessage.value = done
  } catch (e) {
    traitError.value = e.message
  }
}

function onTraitToggle(name) {
  traitNames.value = toggleTrait(traitNames.value, name, props.traits)
  saveTraits({ trait_names: traitNames.value }, 'Kenmerken opgeslagen.')
}

function markTraitsChecked() {
  saveTraits({ traits_checked: true }, 'Kenmerken gecontroleerd.')
}
</script>

<template>
  <section class="card section traits" aria-labelledby="traits-title">
    <div class="traits-head">
      <h2 id="traits-title">Kenmerken</h2>
      <span v-if="ingredient.traits_checked" class="trait-badge">gecontroleerd</span>
      <span v-else class="trait-badge unchecked">nog te controleren</span>
    </div>
    <p class="muted small">
      <template v-if="tagList"
        >Hieruit volgen de automatische tags van recepten: {{ tagList }}.</template
      >
      Een vinkje wordt meteen opgeslagen.
    </p>
    <div class="trait-options" role="group" aria-label="Kenmerken">
      <label v-for="trait in traits" :key="trait.name" class="trait-option">
        <input
          type="checkbox"
          :checked="traitNames.includes(trait.name)"
          @change="onTraitToggle(trait.name)"
        />
        <span>{{ trait.name }}</span>
      </label>
    </div>
    <p v-if="traits.length" class="consequence">→ {{ consequence }}</p>
    <p v-if="traitError" class="error" role="alert">{{ traitError }}</p>
    <p v-else-if="traitMessage" class="muted small" role="status">{{ traitMessage }}</p>
    <button
      v-if="!ingredient.traits_checked"
      type="button"
      class="btn-primary mark-checked"
      @click="markTraitsChecked"
    >
      Gecontroleerd
    </button>
  </section>
</template>

<style scoped>
/* Zoals de andere secties van het bewerkscherm (IngredientEditView). */
.section {
  margin-bottom: var(--space-4);
}

.section p {
  margin-bottom: var(--space-2);
}

.small {
  font-size: var(--text-sm);
}

.traits-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.traits .traits-head h2 {
  margin: 0;
}

.trait-badge {
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-accent-text);
  white-space: nowrap;
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.trait-badge.unchecked {
  color: var(--color-error-text);
  background: var(--color-error-soft);
}

/* Vijf vinkjes; op een telefoon in twee of drie kolommen, elk minstens --tap hoog. */
.trait-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0 var(--space-3);
  margin: var(--space-2) 0;
}

.trait-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  font-weight: 400;
  cursor: pointer;
}

.trait-option input {
  flex-shrink: 0;
}

.consequence {
  margin: 0 0 var(--space-2);
  font-weight: 600;
}

.mark-checked {
  margin-top: var(--space-2);
}
</style>
