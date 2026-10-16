import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import RecipeNutrition from '../components/RecipeNutrition.vue'
import {
  citation,
  formatNutrient,
  notCountedText,
  roundNutrient,
  totalFor,
} from '../utils/nutrition'

const PER_SERVING = { kcal: 827.2, protein: 56.1, carbohydrates: 69, fat: 4.25, fiber: null }

function nutrition(overrides = {}) {
  return {
    servings: 4,
    counted: 3,
    total: {},
    per_serving: PER_SERVING,
    not_counted: [],
    unknown: {},
    sources: [
      { name: 'bloem', source: 'nevo' },
      { name: 'boter', source: 'etiket' },
    ],
    label_values: false,
    nevo_versions: ['2025/9.0'],
    ...overrides,
  }
}

function mountBlock(recipe, servings = 4) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)', component: {} }],
  })
  return mount(RecipeNutrition, {
    props: { recipe: { variations: [], ...recipe }, servings },
    global: { plugins: [router] },
  })
}

const rows = (wrapper) =>
  wrapper.findAll('tbody tr').map((row) => row.findAll('th, td').map((cell) => cell.text()))

describe('afronden en tekst', () => {
  it('rondt kcal vanaf 100 af op tientallen en grammen vanaf 10 op hele getallen', () => {
    expect(roundNutrient(827.2, 'kcal')).toBe(830)
    expect(roundNutrient(84.6, 'kcal')).toBe(85)
    expect(roundNutrient(56.5, 'g')).toBe(57)
    expect(roundNutrient(4.25, 'g')).toBe(4.3)
    expect(roundNutrient(null, 'g')).toBeNull()
    expect(formatNutrient(4.25, 'g')).toBe('± 4,3 g')
    expect(formatNutrient(null, 'g')).toBe('onbekend')
  })

  it('het totaal is per portie maal het gekozen aantal porties', () => {
    expect(totalFor({ kcal: 100, fiber: null }, 6)).toEqual({ kcal: 600, fiber: null })
  })

  it('"n ingrediënten niet meegeteld", enkelvoud bij één', () => {
    expect(notCountedText(1)).toBe('Schatting; 1 ingrediënt niet meegeteld')
    expect(notCountedText(3)).toBe('Schatting; 3 ingrediënten niet meegeteld')
  })

  it('bronvermelding, met "en andere gegevens" alleen bij etiketwaarden', () => {
    expect(citation(nutrition())).toBe(
      'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.',
    )
    expect(citation(nutrition({ label_values: true }))).toBe(
      'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven en andere gegevens.',
    )
  })
})

describe('RecipeNutrition', () => {
  it('is standaard dichtgeklapt en toont per portie en totaal, afgerond met ±', () => {
    const wrapper = mountBlock({ nutrition: nutrition() }, 6)

    expect(wrapper.find('details.nutrition').attributes('open')).toBeUndefined()
    expect(wrapper.find('summary h2').text()).toBe('Voedingswaarde')
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual([
      'Voedingsstof',
      'Per portie',
      'Totaal (6 porties)',
    ])
    expect(rows(wrapper)).toEqual([
      ['Energie', '± 830 kcal', '± 4.960 kcal'],
      ['Eiwit', '± 56 g', '± 337 g'],
      ['Koolhydraten', '± 69 g', '± 414 g'],
      ['Vet', '± 4,3 g', '± 26 g'],
      ['Vezels', 'onbekend', 'onbekend'],
    ])
  })

  it('het totaal schaalt mee met de portiekiezer, per portie niet', async () => {
    const wrapper = mountBlock({ nutrition: nutrition() }, 4)
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 830 kcal', '± 3.310 kcal'])

    await wrapper.setProps({ servings: 1 })
    expect(wrapper.findAll('thead th')[2].text()).toBe('Totaal (1 portie)')
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 830 kcal', '± 830 kcal'])
  })

  it('noemt de niet-meegetelde ingrediënten met de reden, de bron en de waarschuwing', () => {
    const wrapper = mountBlock({
      nutrition: nutrition({
        not_counted: [
          { name: 'zout', reason: 'optioneel' },
          { name: 'bakpoeder', reason: 'niet gekoppeld' },
        ],
        unknown: { fiber: ['ei', 'kaas'] },
        label_values: true,
      }),
    })

    expect(wrapper.find('.not-counted').text()).toBe(
      'Schatting; 2 ingrediënten niet meegeteld: zout (optioneel), bakpoeder (niet gekoppeld).',
    )
    expect(wrapper.find('.unknown').text()).toBe('Vezels onbekend voor ei, kaas; niet meegeteld.')
    expect(wrapper.findAll('.sources li').map((li) => li.text())).toEqual([
      'bloem: NEVO',
      'boter: etiket',
    ])
    expect(wrapper.find('.citation').text()).toContain('RIVM, Bilthoven en andere gegevens.')
    expect(wrapper.find('.disclaimer').text()).toBe(
      'Dit is een schatting en niet medisch betrouwbaar.',
    )
  })

  it('klapt een lange lijst niet-meegetelde ingrediënten apart in', () => {
    const notCounted = ['a', 'b', 'c', 'd', 'e'].map((name) => ({
      name,
      reason: 'geen hoeveelheid',
    }))
    const wrapper = mountBlock({ nutrition: nutrition({ not_counted: notCounted }) })

    const details = wrapper.find('details.not-counted')
    expect(details.find('summary').text()).toBe('Schatting; 5 ingrediënten niet meegeteld')
    expect(details.findAll('li')).toHaveLength(5)
  })

  it('zonder niet-meegetelde ingrediënten geen melding', () => {
    expect(mountBlock({ nutrition: nutrition() }).find('.not-counted').exists()).toBe(false)
  })

  it('met variaties kies je waarvoor; variaties waarin niets meetelt staan er niet bij', async () => {
    const variations = [
      {
        id: 7,
        name: 'Met zalm',
        nutrition: nutrition({ per_serving: { ...PER_SERVING, kcal: 500 } }),
      },
      { id: 8, name: 'Leeg', nutrition: nutrition({ counted: 0 }) },
    ]
    const wrapper = mountBlock({ nutrition: nutrition(), variations })

    const options = wrapper.findAll('#nutrition-for option').map((o) => o.text())
    expect(options).toEqual(['Basisrecept', 'Variatie: Met zalm'])
    await wrapper.find('#nutrition-for').setValue(7)
    expect(rows(wrapper)[0][1]).toBe('± 500 kcal')
  })

  it('zonder variaties geen keuzelijst', () => {
    expect(mountBlock({ nutrition: nutrition() }).find('#nutrition-for').exists()).toBe(false)
  })
})
