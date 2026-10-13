import { vi } from 'vitest'

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Vervangt fetch door een nep-server: handler(method, url, options) geeft per
// request een Response terug. Elke aanroep krijgt een nieuwe Response, want een
// body kan maar één keer gelezen worden.
export function mockFetch(handler) {
  const fake = vi.fn(async (url, options = {}) => handler(options.method ?? 'GET', url, options))
  vi.stubGlobal('fetch', fake)
  return fake
}

export function authHeaderOf(call) {
  return call[1].headers.Authorization
}
