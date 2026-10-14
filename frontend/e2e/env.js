// Gedeeld door playwright.config.js en de tests. De e2e-tests starten een eigen
// Rails (3100) en Vite (5174), zodat ze nooit botsen met je gewone `bin/dev` op 3000/5173.
export const RAILS_PORT = 3100
export const VITE_PORT = 5174
export const RAILS_URL = `http://localhost:${RAILS_PORT}`
export const APP_URL = `http://localhost:${VITE_PORT}`

// Alleen voor deze lokale testserver; met dit token handelt de test verwijderverzoeken af.
export const ADMIN_TOKEN = 'e2e-admin-token'

// Beheer heeft een rate limit per IP (10 per minuut, zoals in productie). Elke test die
// beheer gebruikt, krijgt daarom een eigen adres, zodat de tests elkaars teller niet
// opmaken. Vite stuurt X-Forwarded-For door; Rails vertrouwt localhost als proxy en neemt
// dit adres dan als request.remote_ip, net als achter de proxy van Render.
// 203.0.113.x is een documentatiebereik (TEST-NET-3), dus nooit een echt adres.
export function useOwnIp(page, lastPart) {
  return page.setExtraHTTPHeaders({ 'X-Forwarded-For': `203.0.113.${lastPart}` })
}
