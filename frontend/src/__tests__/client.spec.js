import { describe, it, expect, afterEach, vi } from 'vitest'
import { request } from '../api/client'
import { jsonResponse, mockFetch } from './helpers'

// Welke HTTP-status welke ApiError (kind + melding) geeft.
async function errorFor(response) {
  mockFetch(() => response)
  return request('/api/x').catch((e) => e)
}

describe('api/client request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('geeft de body terug bij een geslaagd antwoord', async () => {
    mockFetch(() => jsonResponse({ id: 1 }))
    expect(await request('/api/x')).toEqual({ id: 1 })
  })

  it('429: toont de Nederlandse melding van de server', async () => {
    const error = await errorFor(
      jsonResponse({ error: 'Te veel pogingen. Wacht een minuut.' }, 429),
    )
    expect(error.kind).toBe('rate_limited')
    expect(error.message).toBe('Te veel pogingen. Wacht een minuut.')
  })

  it('429 zonder melding: een eigen Nederlandse tekst', async () => {
    const error = await errorFor(new Response('', { status: 429 }))
    expect(error.message).toBe('Te veel verzoeken. Probeer het later opnieuw.')
  })

  it('422 met veldfouten: algemene tekst, de fouten per veld', async () => {
    const error = await errorFor(jsonResponse({ errors: { title: ['moet opgegeven zijn'] } }, 422))
    expect(error.kind).toBe('validation')
    expect(error.message).toBe('Controleer de ingevulde velden.')
    expect(error.errors).toEqual({ title: ['moet opgegeven zijn'] })
  })

  it('422 met alleen een melding: die melding', async () => {
    const error = await errorFor(
      jsonResponse({ error: 'Deze versie kan niet worden teruggezet.' }, 422),
    )
    expect(error.kind).toBe('validation')
    expect(error.message).toBe('Deze versie kan niet worden teruggezet.')
    expect(error.errors).toEqual({})
  })

  it('401, 404 en 500 houden hun eigen tekst', async () => {
    expect((await errorFor(jsonResponse({ error: 'Unauthorized' }, 401))).kind).toBe('unauthorized')
    expect((await errorFor(jsonResponse({ error: 'Not found' }, 404))).message).toBe(
      'Niet gevonden.',
    )
    expect((await errorFor(new Response('', { status: 500 }))).kind).toBe('server')
  })

  it('netwerkfout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed'))),
    )
    const error = await request('/api/x').catch((e) => e)
    expect(error.kind).toBe('network')
  })
})
