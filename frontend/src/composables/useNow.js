import { onScopeDispose, ref } from 'vue'

// De huidige tijd als reactieve waarde, voor teksten die met de tijd veranderen ("kopie van
// vandaag 21:57" wordt na middernacht "gisteren 21:57"). Een computed met Date.now() rekent
// alleen opnieuw als iets anders verandert; met deze now doet hij het ook als de tijd
// verstrijkt. Eén gedeelde klok voor de hele app: elke TICK_MS, en meteen bij terugkeren naar
// de app (een telefoon pauzeert timers op de achtergrond) of als het venster weer focus krijgt.
export const TICK_MS = 60_000

const now = ref(Date.now())
let users = 0
let timer = null

function tick() {
  now.value = Date.now()
}

function onVisible() {
  if (document.visibilityState === 'visible') tick()
}

function start() {
  tick()
  timer = setInterval(tick, TICK_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', tick)
  window.addEventListener('pageshow', tick)
}

function stop() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', tick)
  window.removeEventListener('pageshow', tick)
}

// In een component (of een andere effect scope): de klok loopt zolang er iemand kijkt.
export function useNow() {
  if (users++ === 0) start()
  onScopeDispose(() => {
    if (--users === 0) stop()
  })
  return now
}
