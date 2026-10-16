import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import RecipeNutrition from '../components/RecipeNutrition.vue'
import {
  citation,
  formatNutrient,
  ingredientRows,
  notCountedText,
  roundNutrient,
  summarize,
  totalFor,
  valuesText,
} from '../utils/nutrition'

// Zoals app/models/nutrition.rb een regel stuurt: waarden voor het hele recept.
function line(name, values, extra = {}) {
  return {
    id: null,
    ingredient_id: null,
    name,
    grams: null,
    millilitres: null,
    values,
    reason: null,
    source: values ? 'NEVO-product' : null,
    label: false,
    nevo_version: values ? '2025/9.0' : null,
    alternatives: [],
    ...extra,
  }
}

const v = (kcal, protein, carbohydrates, fat, fiber) => ({
  kcal,
  protein,
  carbohydrates,
  fat,
  fiber,
})

// Voor 2 porties: kip 300 g (330 kcal), rijst 150 g (540 kcal), olie 2 el (248 kcal),
// zout zonder hoeveelheid. Kip kan tofu worden (200 g, 240 kcal).
const KIP = line('kip', v(330, 69, 0, 5.4, 0), {
  id: 1,
  ingredient_id: 11,
  grams: 300,
  source: 'Kipfilet rauw',
  alternatives: [
    line('tofu', v(240, 24, 4, 14, null), {
      id: 7,
      ingredient_id: 17,
      grams: 200,
      source: 'etiket',
      label: true,
      nevo_version: null,
    }),
  ],
})
const LINES = [
  KIP,
  line('rijst', v(540, 10, 120, 1, 2), {
    id: 2,
    ingredient_id: 12,
    grams: 150,
    source: 'Witte rijst onbereid',
  }),
  line('olie', v(248.4, 0, 0, 27.6, 0), {
    id: 3,
    ingredient_id: 13,
    grams: 27.6,
    source: 'Olijfolie',
  }),
  line('zout', null, { id: 4, ingredient_id: 14, reason: 'geen hoeveelheid' }),
]

function nutrition(lines = LINES, servings = 2) {
  return { servings, counted: lines.filter((l) => l.values).length, lines }
}

function mountBlock(recipe = {}, { servings = 2, swaps = {} } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ingredienten/:id', name: 'ingredient', component: {} },
      { path: '/:p(.*)', component: {} },
    ],
  })
  return mount(RecipeNutrition, {
    props: {
      recipe: { servings: 2, variations: [], nutrition: nutrition(), ...recipe },
      servings,
      swaps,
    },
    global: { plugins: [router] },
  })
}

const rows = (wrapper) =>
  wrapper.findAll('table tbody tr').map((row) => row.findAll('th, td').map((cell) => cell.text()))

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

  it('bronvermelding: "en andere gegevens" alleen bij etiketwaarden, leeg zonder bron', () => {
    expect(citation({ nevo_versions: ['2025/9.0'], label_values: false })).toBe(
      'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.',
    )
    expect(citation({ nevo_versions: ['2025/9.0'], label_values: true })).toBe(
      'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven en andere gegevens.',
    )
    expect(citation({ nevo_versions: [], label_values: false })).toBe('')
  })

  it('één regel per ingrediënt: alle voedingsstoffen, ? als onbekend', () => {
    expect(valuesText(v(330, 69, 0, 5.4, null))).toBe(
      '330 kcal · 69 g eiwit · 0 g koolh. · 5,4 g vet · ? g vezels',
    )
  })
})

describe('summarize', () => {
  it('telt de regels op, per portie, met wat er niet meetelt en wat onbekend is', () => {
    const result = summarize(nutrition(), {})

    expect(result.total.kcal).toBeCloseTo(1118.4)
    expect(result.per_serving.kcal).toBeCloseTo(559.2)
    expect(result.not_counted).toEqual([{ name: 'zout', reason: 'geen hoeveelheid' }])
    expect(result.unknown).toEqual({})
    expect(result.nevo_versions).toEqual(['2025/9.0'])
    expect(result.label_values).toBe(false)
  })

  it('een gekozen alternatief vervangt zijn regel, ook in onbekend en de bron', () => {
    const result = summarize(nutrition(), { 1: 7 })

    expect(result.total.kcal).toBeCloseTo(1028.4)
    expect(result.unknown).toEqual({ fiber: ['tofu'] })
    expect(result.label_values).toBe(true)
    expect(result.lines[0]).toMatchObject({ name: 'tofu', swappedFrom: 'kip' })
  })

  it('per ingrediënt: grootste kcal bovenaan, niet-meegetelde onderaan, geschaald', () => {
    const list = ingredientRows(summarize(nutrition()).lines, 2)

    expect(list.map((row) => row.name)).toEqual(['rijst', 'kip', 'olie', 'zout'])
    expect(list[0].values.kcal).toBe(1080)
    expect(list[0].grams).toBe(300)
    expect(list[3].values).toBeNull()
  })
})

describe('RecipeNutrition', () => {
  it('is standaard dichtgeklapt en toont per portie en totaal, afgerond met ±', () => {
    const wrapper = mountBlock({}, { servings: 6 })

    expect(wrapper.find('details.nutrition').attributes('open')).toBeUndefined()
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual([
      'Voedingsstof',
      'Per portie',
      'Totaal (6 porties)',
    ])
    expect(rows(wrapper)).toEqual([
      ['Energie', '± 560 kcal', '± 3.360 kcal'],
      ['Eiwit', '± 40 g', '± 237 g'],
      ['Koolhydraten', '± 60 g', '± 360 g'],
      ['Vet', '± 17 g', '± 102 g'],
      ['Vezels', '± 1 g', '± 6 g'],
    ])
  })

  it('het totaal schaalt mee met de portiekiezer, per portie niet', async () => {
    const wrapper = mountBlock()
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 560 kcal', '± 1.120 kcal'])

    await wrapper.setProps({ servings: 1 })
    expect(wrapper.findAll('thead th')[2].text()).toBe('Totaal (1 portie)')
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 560 kcal', '± 560 kcal'])
  })

  it('noemt de niet-meegetelde ingrediënten, onbekende waarden, de bron en de waarschuwing', () => {
    const lines = [...LINES, line('kaas', v(100, 7, 0, 8, null), { id: 5 })]
    const wrapper = mountBlock({ nutrition: nutrition(lines) })

    expect(wrapper.find('p.not-counted').text()).toBe(
      'Schatting; 1 ingrediënt niet meegeteld: zout (geen hoeveelheid).',
    )
    expect(wrapper.find('.unknown').text()).toBe('Vezels onbekend voor kaas; niet meegeteld.')
    expect(wrapper.find('.citation').text()).toBe(
      'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.',
    )
    expect(wrapper.find('.disclaimer').text()).toBe(
      'Dit is een schatting en niet medisch betrouwbaar.',
    )
  })

  it('klapt een lange lijst niet-meegetelde ingrediënten apart in', () => {
    const skipped = ['a', 'b', 'c', 'd', 'e'].map((name) =>
      line(name, null, { reason: 'geen hoeveelheid' }),
    )
    const wrapper = mountBlock({ nutrition: nutrition([...LINES, ...skipped]) })

    const details = wrapper.find('details.not-counted')
    expect(details.find('summary').text()).toBe('Schatting; 6 ingrediënten niet meegeteld')
    expect(details.findAll('li')).toHaveLength(6)
  })

  describe('Per ingrediënt', () => {
    it('is dicht, voor het hele recept, met de grootste kcal bovenaan', () => {
      const wrapper = mountBlock()
      const block = wrapper.find('details.per-ingredient')

      expect(block.attributes('open')).toBeUndefined()
      expect(block.find('summary').text()).toBe('Per ingrediënt')
      expect(block.find('.scope').text()).toBe('Voor het hele recept (2 porties), niet per portie.')
      const items = block.findAll('li')
      expect(items.map((li) => li.find('.row-name').text())).toEqual([
        'rijst',
        'kip',
        'olie',
        'zout',
      ])
      expect(items[1].find('.row-amount').text()).toBe('± 300 g')
      expect(items[1].find('.row-values').text()).toBe(
        '330 kcal · 69 g eiwit · 0 g koolh. · 5,4 g vet · 0 g vezels',
      )
      expect(items[1].find('.row-source').text()).toBe('Kipfilet rauw')
    })

    it('schaalt met de portiekiezer', async () => {
      const wrapper = mountBlock()
      await wrapper.setProps({ servings: 4 })

      const kip = wrapper.findAll('.per-ingredient li')[1]
      expect(kip.find('.row-amount').text()).toBe('± 600 g')
      expect(kip.find('.row-values').text()).toContain('660 kcal')
      expect(wrapper.find('.scope').text()).toContain('(4 porties)')
    })

    it('niet meegeteld: grijs, met de reden en een link naar het ingrediënt (niet bij optioneel)', () => {
      const lines = [
        ...LINES,
        line('peterselie', null, { id: 6, ingredient_id: 16, reason: 'optioneel' }),
      ]
      const wrapper = mountBlock({ nutrition: nutrition(lines) })
      const [zout, peterselie] = wrapper.findAll('.per-ingredient li.skipped')

      expect(zout.find('.row-reason').text()).toBe('Niet meegeteld: geen hoeveelheid. Aanpassen')
      expect(zout.find('a').attributes('href')).toBe('/ingredienten/14')
      expect(peterselie.find('.row-reason').text()).toBe('Niet meegeteld: optioneel.')
      expect(peterselie.find('a').exists()).toBe(false)
    })

    it('verwaarloosbaar staat erbij met 0 en die bron', () => {
      const lines = [
        ...LINES,
        line('bakpoeder', v(0, 0, 0, 0, 0), {
          id: 8,
          source: 'verwaarloosbaar',
          nevo_version: null,
        }),
      ]
      const wrapper = mountBlock({ nutrition: nutrition(lines) })
      const bakpoeder = wrapper
        .findAll('.per-ingredient li')
        .find((li) => li.text().includes('bakpoeder'))

      expect(bakpoeder.classes()).not.toContain('skipped')
      expect(bakpoeder.find('.row-source').text()).toBe('verwaarloosbaar')
      expect(bakpoeder.find('.row-values').text()).toBe(
        '0 kcal · 0 g eiwit · 0 g koolh. · 0 g vet · 0 g vezels',
      )
    })
  })

  it('een gekozen alternatief verandert de totalen en de lijst per ingrediënt', async () => {
    const wrapper = mountBlock()
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 560 kcal', '± 1.120 kcal'])

    await wrapper.setProps({ swaps: { 1: 7 } })
    expect(rows(wrapper)[0]).toEqual(['Energie', '± 510 kcal', '± 1.030 kcal'])
    const tofu = wrapper.findAll('.per-ingredient li').find((li) => li.text().includes('tofu'))
    expect(tofu.find('.row-name').text()).toBe('tofu (i.p.v. kip)')
    expect(tofu.find('.row-source').text()).toBe('etiket')
    expect(wrapper.find('.citation').text()).toContain('en andere gegevens')
  })

  it('met variaties kies je waarvoor; variaties waarin niets meetelt staan er niet bij', async () => {
    const variations = [
      { id: 7, name: 'Met zalm', nutrition: nutrition([line('zalm', v(1000, 1, 1, 1, 1))]) },
      { id: 8, name: 'Leeg', nutrition: { ...nutrition([]), counted: 0 } },
    ]
    const wrapper = mountBlock({ variations })

    const options = wrapper.findAll('#nutrition-for option').map((o) => o.text())
    expect(options).toEqual(['Basisrecept', 'Variatie: Met zalm'])
    await wrapper.find('#nutrition-for').setValue(7)
    expect(rows(wrapper)[0][1]).toBe('± 500 kcal')
    expect(wrapper.findAll('.per-ingredient li').map((li) => li.find('.row-name').text())).toEqual([
      'zalm',
    ])
  })

  it('zonder variaties geen keuzelijst', () => {
    expect(mountBlock().find('#nutrition-for').exists()).toBe(false)
  })
})
