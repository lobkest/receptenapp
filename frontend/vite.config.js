import { execSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// De versie van deze build: de commit (Render geeft hem mee als RENDER_GIT_COMMIT), of
// lokaal die van git. Komt in de JavaScript-bundel (__APP_VERSION__, zie src/version.js)
// én in dist/version.json, dat Rails meestuurt in de X-App-Version-header van elke
// API-response (lib/app_version.rb). Verschillen ze, dan draait de browser een oude bundel
// en herlaadt hij. APP_VERSION overschrijft dit (handig om te testen).
function buildVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 12)
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return `build-${Date.now()}`
  }
}

const APP_VERSION = buildVersion()

// Schrijft dist/version.json naast index.html, alleen bij `vite build`.
function versionFile() {
  return {
    name: 'receptenapp-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    vue(),
    versionFile(),
    // Niet tijdens de e2e-tests: de zwevende DevTools-knop staat anders in elke screenshot.
    ...(process.env.E2E ? [] : [vueDevTools()]),
    // Maakt van de app een PWA: op het beginscherm te zetten, en de app zelf (html, js,
    // css, iconen) werkt ook zonder internet. Alleen in de build; tijdens `npm run dev`
    // is er geen service worker.
    VitePWA({
      // Een nieuwe deploy neemt het meteen over, zonder "nieuwe versie"-knop: de nieuwe
      // service worker wordt meteen actief en registerSW() in src/main.js herlaadt dan
      // open tabbladen (het oude inline-scriptje registreerde alleen, zonder herladen).
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'generateSW',
      // Naast de manifest-iconen (die neemt de plugin zelf mee) ook deze offline bewaren.
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      // Alles in één sw.js, zonder los workbox-<hash>.js ernaast.
      workbox: {
        inlineWorkboxRuntime: true,
        globPatterns: ['**/*.{html,js,css}'],
        // Elke pagina (/recepten/2, /boodschappen) is offline dezelfde index.html;
        // Vue Router kiest daarna de pagina. /api en /up zijn geen pagina's.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/up(\/|$)/],
        // Geen runtimeCaching: de service worker laat /api en /up met rust, dus geen enkele
        // API-response komt uit zijn cache. Alleen de boodschappenlijst bewaart zelf een
        // kopie in localStorage, met tijdstip (src/offline/). version.json hoort niet in
        // de precache (globPatterns): die is alleen voor Rails.
        cleanupOutdatedCaches: true,
        // Een nieuwe service worker wordt meteen actief, in plaats van te wachten tot alle
        // tabbladen van de app dicht zijn. Moet er expliciet staan: zonder dit zet
        // vite-plugin-pwa 2 skipWaiting alleen achter een bericht dat registerSW() bij
        // autoUpdate niet stuurt, en bleef de nieuwe versie eeuwig op "waiting" staan.
        skipWaiting: true,
        // Een nieuwe service worker neemt open tabbladen meteen over, niet pas na herladen.
        clientsClaim: true,
      },
      manifest: {
        name: 'Receptenapp',
        short_name: 'Recepten',
        lang: 'nl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Licht, zoals de achtergrond van de app (--color-bg in main.css).
        theme_color: '#faf8f4',
        background_color: '#faf8f4',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Tijdens development stuurt Vite alle /api-verzoeken door naar Rails.
    // De browser praat zo met één origin, dus CORS is niet nodig.
    proxy: {
      // API_TARGET: de e2e-tests laten Vite naar hun eigen Rails-server wijzen.
      '/api': process.env.API_TARGET ?? 'http://localhost:3000',
      // De health check van Rails, voor src/stores/serverStatus.js.
      '/up': process.env.API_TARGET ?? 'http://localhost:3000',
    },
  },
  // `vite preview` (de gebouwde app, met service worker) gebruikt dezelfde proxy;
  // de offline-e2e-test draait daarop.
  preview: {
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:3000',
      '/up': process.env.API_TARGET ?? 'http://localhost:3000',
    },
  },
})
