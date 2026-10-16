<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { orderedCategories } from '@/utils/categories'

// Kiest de categorie van een recept. v-model is de naam ('' = geen categorie), want de
// server kent een categorie op naam (category_name): een bestaande naam kiest die, een
// nieuwe maakt hem aan.
//
// Eén rij kleine knoppen: de standaardcategorieën (de eerste STANDARD_COUNT op volgorde)
// en "+". Met "+" kies je een van de overige categorieën of typ je een nieuwe.
const props = defineProps({
  modelValue: { type: String, default: '' },
  // Alle categorieën uit /api/categories: [{ id, name, position }].
  options: { type: Array, default: () => [] },
  // Een melding van de server, al met "Categorie" ervoor; of null.
  error: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue'])

const STANDARD_COUNT = 4
// Waarde van "Nieuwe categorie…" in de keuzelijst. Kan niet botsen: de andere waarden
// zijn id's, en die zijn altijd een getal.
const NEW_CATEGORY = 'new'

const uid = useId()
const ordered = computed(() => orderedCategories(props.options))
const standard = computed(() => ordered.value.slice(0, STANDARD_COUNT))
const others = computed(() => ordered.value.slice(STANDARD_COUNT))

// Zoals op de server: "ontbijt" is dezelfde categorie als "Ontbijt".
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

const chosenStandard = computed(() =>
  props.modelValue ? standard.value.find((c) => same(c.name, props.modelValue)) : undefined,
)
// Een gekozen categorie die geen standaard is (bij bewerken, of via "+"): dan staat
// "+" ingedrukt, met de naam erop.
const chosenOther = computed(() =>
  props.modelValue && !chosenStandard.value ? props.modelValue : null,
)

// Het deel onder de knoppen: keuzelijst en/of tekstveld voor een nieuwe naam.
const open = ref(false)
const choice = ref('')
const newName = ref('')
const clientError = ref(null)
const select = useTemplateRef('select')
const newNameInput = useTemplateRef('newNameInput')

function close() {
  open.value = false
  choice.value = ''
  newName.value = ''
  clientError.value = null
}

// Nog eens tikken op de gekozen knop zet hem uit: geen categorie.
function toggleStandard(category) {
  close()
  emit('update:modelValue', chosenStandard.value?.id === category.id ? '' : category.name)
}

async function focusNewName() {
  await nextTick()
  newNameInput.value?.focus()
}

// Zonder overige categorieën heeft een keuzelijst geen zin: dan meteen het tekstveld.
async function onMore() {
  if (open.value) return close()

  open.value = true
  clientError.value = null
  if (!others.value.length) {
    choice.value = NEW_CATEGORY
    return focusNewName()
  }
  const current = chosenOther.value && others.value.find((c) => same(c.name, chosenOther.value))
  choice.value = current ? String(current.id) : ''
  await nextTick()
  select.value?.focus()
}

// Een bestaande kiezen sluit het deel weer; "Nieuwe categorie…" toont het tekstveld.
function onChoose() {
  clientError.value = null
  if (choice.value === NEW_CATEGORY) {
    emit('update:modelValue', newName.value.trim())
    return focusNewName()
  }
  const category = others.value.find((c) => String(c.id) === choice.value)
  emit('update:modelValue', category?.name ?? '')
  if (category) close()
}

function onNewName() {
  clientError.value = null
  emit('update:modelValue', newName.value.trim())
}

// Voor het formulier, vlak voor versturen: "Nieuwe categorie…" zonder naam zou
// stilletjes "geen categorie" worden. Geeft false (en een melding) als het niet klopt.
function validate() {
  if (open.value && choice.value === NEW_CATEGORY && !newName.value.trim()) {
    clientError.value = 'Vul een naam voor de nieuwe categorie in.'
    newNameInput.value?.focus()
    return false
  }
  return true
}

defineExpose({ validate })

const shownError = computed(() => clientError.value ?? props.error)
</script>

<template>
  <div class="category-picker">
    <!-- Altijd één regel: de standaardknoppen delen de breedte, "+" krijgt wat hij nodig heeft. -->
    <div
      class="buttons"
      role="group"
      aria-label="Categorie"
      :style="{ '--standard-count': standard.length }"
    >
      <button
        v-for="category in standard"
        :key="category.id"
        type="button"
        class="category-option"
        :aria-pressed="chosenStandard?.id === category.id"
        @click="toggleStandard(category)"
      >
        {{ category.name }}
      </button>
      <button
        type="button"
        class="category-more"
        :class="{ named: chosenOther }"
        :aria-pressed="!!chosenOther"
        :aria-expanded="open"
        :aria-label="
          chosenOther ? `Andere categorie: ${chosenOther}` : 'Andere of nieuwe categorie'
        "
        @click="onMore"
      >
        {{ chosenOther ?? '+' }}
      </button>
    </div>

    <div v-if="open" class="more">
      <template v-if="others.length">
        <label :for="`${uid}-select`">Andere categorie</label>
        <select :id="`${uid}-select`" ref="select" v-model="choice" @change="onChoose">
          <option value="">Kies een categorie…</option>
          <option v-for="category in others" :key="category.id" :value="String(category.id)">
            {{ category.name }}
          </option>
          <option :value="NEW_CATEGORY">Nieuwe categorie…</option>
        </select>
      </template>

      <template v-if="choice === NEW_CATEGORY">
        <label :for="`${uid}-new`">Nieuwe categorie</label>
        <input
          :id="`${uid}-new`"
          ref="newNameInput"
          v-model="newName"
          type="text"
          placeholder="bijv. Bijgerecht"
          :aria-invalid="!!shownError"
          :aria-describedby="shownError ? `${uid}-error` : undefined"
          @input="onNewName"
        />
      </template>
    </div>

    <p v-if="shownError" :id="`${uid}-error`" class="error">{{ shownError }}</p>
  </div>
</template>

<style scoped>
.category-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* minmax(0, 1fr): een knop mag smaller worden dan zijn tekst (die krijgt dan "…"), zodat
   de rij nooit breder wordt dan het scherm. */
.buttons {
  display: grid;
  grid-template-columns: repeat(var(--standard-count), minmax(0, 1fr)) auto;
  gap: var(--space-1);
}

/* Als de filter-chips op het receptentabblad, maar kleiner. */
.buttons button {
  min-width: 0;
  min-height: var(--tap);
  /* Weinig binnenmarge: met een naam op "+" moeten vier knoppen nog in ~62px passen. */
  padding: 0 var(--space-1);
  overflow: hidden;
  /* Net onder --text-sm: zo passen "Ontbijt" en "Snacks" ook naast een naam op "+". */
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  border-radius: var(--radius-full);
}

.buttons button[aria-pressed='true'] {
  color: var(--color-on-brand);
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.buttons button[aria-pressed='true']:hover {
  color: var(--color-on-brand);
  background: var(--color-brand-strong);
}

/* "+" is rond; met een naam erop wordt hij een pil van hoogstens 6rem (langere namen
   krijgen "…"), zodat de vier standaardknoppen leesbaar blijven. */
.buttons .category-more {
  width: var(--tap);
  font-size: var(--text-lg);
  color: var(--color-accent-text);
}

.buttons .category-more.named {
  width: auto;
  max-width: 6rem;
  padding: 0 var(--space-2);
  font-size: 0.8125rem;
}

.more {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.more input {
  margin-bottom: var(--space-1);
}
</style>
