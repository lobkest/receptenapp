import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
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
      '/api': 'http://localhost:3000',
    },
  },
})
