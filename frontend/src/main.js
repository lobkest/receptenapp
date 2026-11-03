import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import router from './router'
import { initOffline } from './offline'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Eerst de offline opslag (IndexedDB) in het geheugen, dan pas de app: de stores lezen de
// kopieën en de outbox daarna gewoon synchroon (src/offline/storage.js). Een paar
// milliseconden; mislukt het, dan start de app zonder kopie.
initOffline()
  .catch(() => {})
  .finally(() => app.mount('#app'))

// De service worker (vite.config.js). Bij een nieuwe deploy wordt de nieuwe meteen actief
// en herlaadt registerSW() de pagina met de nieuwe bundel. Elke keer dat je terugkomt naar
// het tabblad kijken we of er een nieuwe is; zo blijft een laptop-tabblad dat dagen open
// staat niet op een oude versie hangen. Zie ook src/version.js.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})
