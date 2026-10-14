import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Niet tijdens de e2e-tests: de zwevende DevTools-knop staat anders in elke screenshot.
    ...(process.env.E2E ? [] : [vueDevTools()]),
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
})
