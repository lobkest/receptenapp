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

  // Het ene foutformaat van de server: { error: '…', errors: { veld: ['…'] } }.
  it.each([
    [400, 'validation'],
    [401, 'unauthorized'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'validation'],
    [429, 'rate_limited'],
  ])('%i: kind %s, met de melding en de veldfouten van de server', async (status, kind) => {
    const error = await errorFor(
      jsonResponse(
        { error: 'Melding van de server.', errors: { servings: ['is geen getal'] } },
        status,
      ),
    )
    expect(error.kind).toBe(kind)
    expect(error.status).toBe(status)
    expect(error.message).toBe('Melding van de server.')
    expect(error.errors).toEqual({ servings: ['is geen getal'] })
  })

  it.each([
    [400, 'Controleer de ingevulde velden.'],
    [401, 'De beheercode is onjuist of verlopen.'],
    [404, 'Niet gevonden.'],
    [409, 'Dit is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.'],
    [500, 'Er ging iets mis op de server.'],
  ])('%i zonder body (bijv. een proxy): een eigen Nederlandse tekst', async (status, message) => {
    const error = await errorFor(new Response('', { status }))
    expect(error.message).toBe(message)
    expect(error.errors).toEqual({})
  })

  it('500 toont nooit de tekst van de server (dat kan een stacktrace zijn)', async () => {
    const error = await errorFor(jsonResponse({ error: 'NoMethodError in …' }, 500))
    expect(error.kind).toBe('server')
    expect(error.message).toBe('Er ging iets mis op de server.')
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
