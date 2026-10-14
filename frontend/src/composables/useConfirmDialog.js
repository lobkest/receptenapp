import { inject, provide } from 'vue'

// Eén ConfirmDialog per pagina, te gebruiken door de componenten eronder. De pagina zet
// hem neer en geeft hem door met provide; een component haalt hem op met inject. Zo
// hoeft niet elk component een eigen <dialog> te hebben, en hoeft de functie niet als
// prop door elke laag heen. Vergelijk met dependency injection in Spring.
//
//   // in de pagina
//   const confirmDialog = useTemplateRef('confirmDialog')
//   provideConfirmDialog(confirmDialog)          // <ConfirmDialog ref="confirmDialog" />
//
//   // in een component eronder
//   const { askWithInput } = useConfirmDialog()
const KEY = Symbol('confirmDialog')

export function provideConfirmDialog(dialog) {
  provide(KEY, {
    ask: (options) => dialog.value.ask(options),
    askWithInput: (options) => dialog.value.askWithInput(options),
  })
}

export function useConfirmDialog() {
  return inject(KEY)
}
