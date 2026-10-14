import { defineConfig, devices } from '@playwright/test'
import { ADMIN_TOKEN, APP_URL, RAILS_PORT, RAILS_URL, VITE_PORT } from './e2e/env.js'

// Visuele controle op een geëmuleerde iPhone. Draai met `npm run test:e2e`.
export default defineConfig({
  testDir: './e2e',
  // De tests delen testdata (recepten in de database), dus één voor één.
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  // Na de run de testdatabase leegmaken (ook losse ingrediënten).
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: APP_URL,
  },
  projects: [
    {
      name: 'iphone',
      // iPhone-scherm, touch en user agent, maar op Chromium (WebKit vraagt extra systeempakketten).
      // colorScheme dark: ook als je telefoon op donker staat, moet de app licht blijven.
      use: { ...devices['iPhone 13'], browserName: 'chromium', colorScheme: 'dark' },
    },
  ],
  // Twee servers, net als in development: Rails voor /api, Vite voor de frontend.
  // Vite stuurt /api door naar deze Rails (API_TARGET in vite.config.js).
  webServer: [
    {
      // RAILS_ENV=test: de testdatabase, nooit je development-data. Eerst klaarzetten
      // en leegmaken, dan starten. Eigen pid-bestand, anders weigert Rails te starten
      // als je gewone server al draait. De rate limit staat in deze omgeving in
      // :memory_store, dus elke run begint met een nieuwe teller.
      command: `bin/rails db:prepare && bin/rails db:truncate_all && bin/rails server -p ${RAILS_PORT} -P tmp/pids/e2e.pid`,
      cwd: '..',
      url: `${RAILS_URL}/up`,
      // Hoge limieten: na een mislukte test start Playwright opnieuw en maakt het de
      // testdata nog eens aan; met de normale 5 inzendingen per uur (of 120 schrijfacties
      // per minuut, alles vanaf localhost) zou dat op 429 stuklopen.
      env: {
        RAILS_ENV: 'test',
        ADMIN_TOKEN,
        RECIPE_SUBMISSIONS_PER_HOUR: '1000',
        PUBLIC_WRITES_PER_MINUTE: '10000',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${VITE_PORT} --strictPort`,
      url: APP_URL,
      env: { API_TARGET: RAILS_URL, E2E: '1' },
      reuseExistingServer: false,
    },
  ],
})
