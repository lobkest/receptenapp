import { onMounted, onUnmounted, ref } from 'vue'

// Houdt het scherm aan zolang het component dat dit gebruikt op de pagina staat.
//
// Screen Wake Lock API: navigator.wakeLock.request('screen') vraagt de browser om
// het scherm niet te dimmen of te vergrendelen. Je krijgt een "sentinel" terug;
// sentinel.release() geeft het slot weer vrij. De browser laat het slot zelf los
// als de tab verborgen raakt (ander tabblad, telefoon vergrendeld), dus vragen we
// het opnieuw aan zodra de pagina weer zichtbaar is.
//
// Alleen beschikbaar via https of localhost. Zonder ondersteuning werkt alles
// gewoon, alleen kan het scherm dan uitgaan.
//
// status: 'pending' (nog bezig), 'active', 'unsupported' of 'error' (geweigerd,
// bijv. door de batterijbespaarstand).
export function useWakeLock() {
  const status = ref('pending')
  let sentinel = null
  let stopped = false
  // Voorkomt twee aanvragen tegelijk (en dus een slot dat nooit wordt vrijgegeven).
  let requesting = false

  async function acquire() {
    if (!('wakeLock' in navigator)) {
      status.value = 'unsupported'
      return
    }
    if (requesting) return
    requesting = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      // Pagina al verlaten terwijl we wachtten: meteen weer vrijgeven.
      if (stopped) {
        lock.release().catch(() => {})
        return
      }
      sentinel = lock
      status.value = 'active'
    } catch {
      status.value = 'error'
    } finally {
      requesting = false
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) acquire()
  }

  onMounted(() => {
    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    sentinel?.release().catch(() => {})
    sentinel = null
  })

  return { status }
}
