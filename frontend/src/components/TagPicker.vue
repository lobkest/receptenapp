<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'

// Kiest tags voor een recept. v-model is een lijst namen: ['vega', 'snel'].
// Toevoegen uit de bestaande tags (options) of een nieuwe typen; verwijderen met ×.
// Namen worden hier al genormaliseerd zoals op de server ("  Snel " → "snel"), zodat
// je meteen ziet dat iets dubbel is.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // Bestaande tags uit /api/tags, al gesorteerd.
  options: { type: Array, default: () => [] },
  max: { type: Number, default: 10 },
})

const emit = defineEmits(['update:modelValue'])

const MAX_LENGTH = 30
// Waarde van "Nieuwe tag…": kan geen echte tag zijn, want die zijn in kleine letters.
const NEW_TAG = 'NEW'

const uid = useId()
const choice = ref('')
const newTag = ref('')
const message = ref(null)
const select = useTemplateRef('select')
const newTagInput = useTemplateRef('newTagInput')

const available = computed(() => props.options.filter((tag) => !props.modelValue.includes(tag)))
const full = computed(() => props.modelValue.length >= props.max)

function normalize(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

// true als de tag erbij is gekomen; anders staat de reden in message.
function add(name) {
  const tag = normalize(name)
  message.value = null
  if (!tag) return false
  if (tag.includes(',')) {
    message.value = 'Een tag mag geen komma bevatten.'
  } else if (props.modelValue.includes(tag)) {
    message.value = `"${tag}" is al gekozen.`
  } else if (full.value) {
    message.value = `Maximaal ${props.max} tags.`
  } else {
    emit('update:modelValue', [...props.modelValue, tag])
    return true
  }
  return false
}

// Een bestaande tag kiezen voegt hem meteen toe; "Nieuwe tag…" toont het tekstveld.
async function onChoose() {
  message.value = null
  if (choice.value === NEW_TAG) {
    await nextTick()
    newTagInput.value?.focus()
    return
  }
  if (choice.value) add(choice.value)
  choice.value = ''
}

async function addNew() {
  if (!add(newTag.value)) return
  newTag.value = ''
  choice.value = ''
  await nextTick()
  select.value?.focus()
}

function remove(tag) {
  message.value = null
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== tag),
  )
}
</script>

<template>
  <div class="tag-picker">
    <ul v-if="modelValue.length" class="chips" aria-label="Gekozen tags">
      <li v-for="tag in modelValue" :key="tag" class="chip">
        <span class="chip-name">{{ tag }}</span>
        <button
          type="button"
          class="chip-remove"
          :aria-label="`${tag} verwijderen`"
          @click="remove(tag)"
        >
          ×
        </button>
      </li>
    </ul>

    <label :for="`${uid}-select`" class="picker-label">Tag toevoegen</label>
    <select
      :id="`${uid}-select`"
      ref="select"
      v-model="choice"
      class="tag-select"
      :disabled="full"
      @change="onChoose"
    >
      <option value="">Kies een tag…</option>
      <option v-for="tag in available" :key="tag" :value="tag">{{ tag }}</option>
      <option :value="NEW_TAG">Nieuwe tag…</option>
    </select>

    <div v-if="choice === NEW_TAG" class="new-tag">
      <label :for="`${uid}-new`">Nieuwe tag</label>
      <div class="new-tag-row">
        <!-- Enter voegt toe; .prevent zodat Enter niet het hele recept verstuurt. -->
        <input
          :id="`${uid}-new`"
          ref="newTagInput"
          v-model="newTag"
          type="text"
          class="new-tag-input"
          :maxlength="MAX_LENGTH"
          placeholder="bijv. glutenvrij"
          @keydown.enter.prevent="addNew"
        />
        <button type="button" class="new-tag-add" @click="addNew">Toevoegen</button>
      </div>
    </div>

    <p v-if="message" class="error">{{ message }}</p>
    <p v-else-if="full" class="hint muted">Maximaal {{ max }} tags.</p>
  </div>
</template>

<style scoped>
.tag-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Een pil met de naam en een × van 44×44; de pil zelf is dus ook 44 hoog. */
.chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: var(--tap);
  padding-left: var(--space-3);
  font-weight: 600;
  color: var(--color-accent-text);
  background: var(--color-brand-soft);
  border-radius: var(--radius-full);
}

.chip-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip-remove {
  flex-shrink: 0;
  width: var(--tap);
  padding: 0;
  font-size: var(--text-lg);
  color: inherit;
  background: transparent;
  border-color: transparent;
  border-radius: var(--radius-full);
}

.chip-remove:hover:not(:disabled) {
  color: var(--color-accent-text);
  background: color-mix(in srgb, var(--color-brand) 15%, transparent);
}

.picker-label {
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.new-tag {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.new-tag-row {
  display: flex;
  gap: var(--space-2);
}

.new-tag-input {
  flex: 1;
  min-width: 0;
}

.new-tag-add {
  flex-shrink: 0;
}

.hint,
.error {
  margin: 0;
  font-size: var(--text-sm);
}
</style>
