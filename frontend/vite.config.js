import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Niet tijdens de e2e-tests: de zwevende DevTools-knop staat anders in elke screenshot.
    ...(process.env.E2E ? [] : [vueDevTools()]),
    // Maakt van de app een PWA: op het beginscherm te zetten, en de app zelf (html, js,
    // css, iconen) werkt ook zonder internet. Alleen in de build; tijdens `npm run dev`
    // is er geen service worker.
    VitePWA({
      // Een nieuwe deploy neemt het meteen over (en herlaadt open tabbladen), zonder
      // "nieuwe versie"-knop.
      registerType: 'autoUpdate',
      // Het registreerscriptje komt inline in index.html: geen los bestand in public/.
      injectRegister: 'inline',
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
        // Geen runtimeCaching: de service worker laat /api met rust. De boodschappenlijst
        // bewaart zelf een kopie in localStorage (src/offline/).
        cleanupOutdatedCaches: true,
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
    },
  },
  // `vite preview` (de gebouwde app, met service worker) gebruikt dezelfde proxy;
  // de offline-e2e-test draait daarop.
  preview: {
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:3000',
    },
  },
})
