<script setup>
import { nextTick, ref, useId, useTemplateRef } from 'vue'

// Een bevestigingsvenster op basis van <dialog>. Gebruik:
//   <ConfirmDialog ref="confirmDialog" />
//   if (await confirmDialog.value.ask({ title: 'banaan verwijderen?' })) { … }
// ask() geeft een Promise die true wordt bij "Verwijderen" en false bij Annuleren of Escape.
// Zo leest de aanroep als window.confirm, maar dan in de stijl van de app.
//
// Met een invulveld (bijv. een reden):
//   const reason = await confirmDialog.value.askWithInput({ title, inputLabel: 'Reden (optioneel)' })
// geeft null bij Annuleren of Escape, anders de ingevulde tekst (mag leeg zijn).
// secret: true geeft een wachtwoordveld in plaats van een tekstvak (bijv. de beheercode).

const uid = useId()
const dialog = useTemplateRef('dialog')
const cancelButton = useTemplateRef('cancelButton')

const content = ref({
  title: '',
  text: '',
  confirmLabel: 'Verwijderen',
  inputLabel: null,
  secret: false,
})
const input = ref('')
let answer = null

async function ask({ title, text = '', confirmLabel = 'Verwijderen' }) {
  return open({ title, text, confirmLabel, inputLabel: null, secret: false })
}

async function askWithInput({
  title,
  text = '',
  confirmLabel = 'Verwijderen',
  inputLabel,
  secret = false,
}) {
  const confirmed = await open({ title, text, confirmLabel, inputLabel, secret })
  return confirmed ? input.value.trim() : null
}

async function open(options) {
  content.value = options
  input.value = ''
  await nextTick()
  // showModal: venster boven alles, rest van de pagina niet aan te klikken. Oudere browsers
  // (en jsdom in de tests) kennen het niet; dan tonen we hem gewoon met het open-attribuut.
  if (typeof dialog.value.showModal === 'function') {
    dialog.value.showModal()
  } else {
    dialog.value.setAttribute('open', '')
  }
  // Focus op Annuleren: wie per ongeluk Enter drukt, verwijdert niets.
  cancelButton.value.focus()
  return new Promise((resolve) => (answer = resolve))
}

function close(confirmed) {
  if (typeof dialog.value.close === 'function') {
    dialog.value.close()
  } else {
    dialog.value.removeAttribute('open')
  }
  answer?.(confirmed)
  answer = null
}

defineExpose({ ask, askWithInput })
</script>

<template>
  <!-- Escape: zelf afgevangen (keydown) én het cancel-event van de browser, zodat het
       overal hetzelfde werkt en de Promise altijd een antwoord krijgt. -->
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="`${uid}-title`"
    :aria-describedby="content.text ? `${uid}-text` : undefined"
    @keydown.esc.prevent="close(false)"
    @cancel.prevent="close(false)"
  >
    <h2 :id="`${uid}-title`">{{ content.title }}</h2>
    <p v-if="content.text" :id="`${uid}-text`" class="text">{{ content.text }}</p>
    <div v-if="content.inputLabel" class="field">
      <label :for="`${uid}-input`">{{ content.inputLabel }}</label>
      <input
        v-if="content.secret"
        :id="`${uid}-input`"
        v-model="input"
        type="password"
        class="dialog-input"
        autocomplete="current-password"
      />
      <textarea
        v-else
        :id="`${uid}-input`"
        v-model="input"
        class="dialog-input"
        rows="2"
      ></textarea>
    </div>
    <div class="actions">
      <button ref="cancelButton" type="button" class="cancel" @click="close(false)">
        Annuleren
      </button>
      <button type="button" class="confirm" @click="close(true)">
        {{ content.confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(24rem, calc(100vw - 2 * var(--space-4)));
  padding: var(--space-5);
  color: var(--color-text);
  background: var(--color-surface);
  border: 0;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.confirm-dialog::backdrop {
  background: color-mix(in srgb, var(--color-text) 45%, transparent);
}

h2 {
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.text {
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.actions button {
  flex: 1 1 0;
}

/* Verwijderen in de danger-kleur, gevuld: de gevolgen zijn niet terug te draaien. */
.confirm {
  color: var(--color-on-danger);
  background: var(--color-danger);
  border-color: var(--color-danger);
}

.confirm:hover:not(:disabled) {
  color: var(--color-on-danger);
  background: var(--color-error-text);
  border-color: var(--color-error-text);
}
</style>
