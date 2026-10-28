import { describe, it, expect } from 'vitest'
import { splitLinks } from '../utils/links'

describe('splitLinks', () => {
  it('laat tekst zonder link heel', () => {
    expect(splitLinks('Lekker met rijst.')).toEqual([{ text: 'Lekker met rijst.' }])
  })

  it('knipt een link uit de tekst', () => {
    expect(splitLinks('Van https://example.com/soep vandaan')).toEqual([
      { text: 'Van ' },
      { url: 'https://example.com/soep', text: 'https://example.com/soep' },
      { text: ' vandaan' },
    ])
  })

  it('laat een punt of komma na de link bij de zin horen', () => {
    expect(splitLinks('Zie http://x.nl/a?b=1.')).toEqual([
      { text: 'Zie ' },
      { url: 'http://x.nl/a?b=1', text: 'http://x.nl/a?b=1' },
      { text: '.' },
    ])
    expect(splitLinks('(zie https://x.nl), lekker')[1].url).toBe('https://x.nl')
  })

  it('houdt haakjes die bij de link horen', () => {
    const url = 'https://nl.wikipedia.org/wiki/Curry_(gerecht)'
    expect(splitLinks(`Zie ${url}.`)[1].url).toBe(url)
  })

  it('maakt van www. een https-link', () => {
    expect(splitLinks('www.example.com')).toEqual([
      { url: 'https://www.example.com', text: 'www.example.com' },
    ])
  })

  it('vindt meerdere links, ook op verschillende regels', () => {
    const parts = splitLinks('Bron: https://a.nl\nVideo: https://b.nl')
    expect(parts.filter((part) => part.url).map((part) => part.url)).toEqual([
      'https://a.nl',
      'https://b.nl',
    ])
    expect(parts[2]).toEqual({ text: '\nVideo: ' })
  })

  it('maakt geen link van javascript: of andere schema’s', () => {
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
  })
})
