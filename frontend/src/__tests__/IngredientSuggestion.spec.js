import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { compactName, similarIngredient } from '../utils/similarIngredient'
import { jsonResponse, mockFetch } from './helpers'

const NAMES = [
  'zoete aardappel',
  'blauwe bes',
  'trostomaat',
  'chiazaad',
  'crème fraîche',
  'yoghurt',
  'ei',
  'ui',
  'appel',
  'kip',
]

describe('similarIngredient', () => {
  it('herkent meervoud', () => {
    expect(similarIngredient('zoete aardappelen', NAMES)).toBe('zoete aardappel')
    expect(similarIngredient('blauwe bessen', NAMES)).toBe('blauwe bes')
    expect(similarIngredient('trostomaten', NAMES)).toBe('trostomaat')
    expect(similarIngredient('appels', NAMES)).toBe('appel')
  })

  it('negeert accenten, spaties, hoofdletters en streepjes', () => {
    expect(compactName(' Crème  Fraîche ')).toBe('cremefraiche')
    expect(similarIngredient('creme fraiche', NAMES)).toBe('crème fraîche')
    expect(similarIngredient('Chia zaad', NAMES)).toBe('chiazaad')
    expect(similarIngredient('chia-zaad', NAMES)).toBe('chiazaad')
  })

  it('herkent kleine typfouten, ook twee omgewisselde letters', () => {
    expect(similarIngredient('yohgurt', NAMES)).toBe('yoghurt')
    expect(similarIngredient('trostomat', NAMES)).toBe('trostomaat')
    expect(similarIngredient('zoete aadrappel', NAMES)).toBe('zoete aardappel')
  })

  it('geen suggestie voor een bestaande naam, korte namen of iets anders', () => {
    expect(similarIngredient('Zoete  Aardappel', NAMES)).toBeNull()
    expect(similarIngredient('ai', NAMES)).toBeNull()
    expect(similarIngredient('kap', NAMES)).toBeNull()
    expect(similarIngredient('tofu', NAMES)).toBeNull()
    expect(similarIngredient('', NAMES)).toBeNull()
  })
})

describe('"Bedoel je" in de formulieren', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  // Vers geïmporteerd: de namen worden per bezoek één keer opgehaald (module-state).
  async function mountWithNames(path) {
    mockFetch((method, url) => {
      if (url === '/api/ingredients') return jsonResponse(NAMES.map((name, id) => ({ id, name })))
      throw new Error(`Onverwacht: ${method} ${url}`)
    })
    const component = (await import(path)).default
    const wrapper = mount(component)
    await flushPromises()
    return wrapper
  }

  it('receptformulier: toont de suggestie en neemt de naam over bij tikken', async () => {
    const wrapper = await mountWithNames('../components/RecipeForm.vue')
    const name = wrapper.find('.ingredient-row input.name')

    await name.setValue('Zoete aardappelen')
    const suggestion = wrapper.find('.ingredient-suggestion')
    expect(suggestion.text()).toBe('Bedoel je: zoete aardappel?')

    await suggestion.find('button').trigger('click')
    expect(name.element.value).toBe('zoete aardappel')
    expect(wrapper.find('.ingredient-suggestion').exists()).toBe(false)
  })

  it('receptformulier: niet blokkerend, en niets bij een nieuwe naam', async () => {
    const wrapper = await mountWithNames('../components/RecipeForm.vue')
    await wrapper.find('.ingredient-row input.name').setValue('tempeh')
    expect(wrapper.find('.ingredient-suggestion').exists()).toBe(false)
  })

  it('variatieformulier: ook bij een extra ingrediënt', async () => {
    const wrapper = await mountWithNames('../components/VariationForm.vue')
    const name = wrapper.find('.addition-row input.name')

    await name.setValue('yohgurt')
    expect(wrapper.find('.ingredient-suggestion').text()).toBe('Bedoel je: yoghurt?')
    await wrapper.find('.ingredient-suggestion button').trigger('click')
    expect(name.element.value).toBe('yoghurt')
  })
})
