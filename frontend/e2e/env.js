// Gedeeld door playwright.config.js en de tests. De e2e-tests starten een eigen
// Rails (3100) en Vite (5174), zodat ze nooit botsen met je gewone `bin/dev` op 3000/5173.
export const RAILS_PORT = 3100
export const VITE_PORT = 5174
export const RAILS_URL = `http://localhost:${RAILS_PORT}`
export const APP_URL = `http://localhost:${VITE_PORT}`

// Alleen voor deze lokale testserver; met dit token keurt de test zijn eigen recepten goed.
export const ADMIN_TOKEN = 'e2e-admin-token'
