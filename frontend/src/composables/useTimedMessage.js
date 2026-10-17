import { onUnmounted, ref } from 'vue'

// Een korte bevestiging die na een paar seconden vanzelf verdwijnt ("… staat op je
// boodschappenlijst."). Elke nieuwe melding begint de tijd opnieuw; als het component
// verdwijnt, stopt de timer.
//
//   const { message, show, hide } = useTimedMessage()
//   show('Opgeslagen.')   // in de template: <p v-if="message">{{ message }}</p>
//
// message mag ook een object zijn, zoals { text, toList } op de standaardlijst.
export const MESSAGE_MS = 3000

export function useTimedMessage(duration = MESSAGE_MS) {
  const message = ref(null)
  let timer = null

  function show(value) {
    message.value = value
    clearTimeout(timer)
    timer = setTimeout(() => (message.value = null), duration)
  }

  function hide() {
    clearTimeout(timer)
    message.value = null
  }

  onUnmounted(() => clearTimeout(timer))

  return { message, show, hide }
}
