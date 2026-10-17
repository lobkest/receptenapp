import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Receptkaarten binnen een sectie op kaarthoogte: weinig tags eerst, gelijke aantallen
// op titel. Zo staan kaarten van gelijke hoogte naast elkaar in het 2-koloms grid van
// de iPhone. Screenshot in e2e/screenshots/ om zelf te bekijken.

let api
// Bewust niet op volgorde aangemaakt; [titel, sectie, tags]. Tags die geen andere test
// gebruikt, anders duiken deze recepten op in hun tagfilters. Elk recept krijgt ook
// de vier automatische tags (vegetarisch, ...), die tellen op de kaart mee.
const DATA = [
  ['Yoghurt met granola', 'Ontbijt', ['zondag', 'licht', 'lauw']],
  ['Boterham met kaas', 'Ontbijt', []],
  ['Havermout', 'Ontbijt', ['zondag', 'gezond', 'licht']],
  ['Croissant', 'Ontbijt', []],
  ['Wokschotel', 'Diner', ['licht', 'budget', 'gezond', 'bbq', 'weekend', 'zondag']],
  ['Stamppot', 'Diner', ['gezond']],
  ['Curry', 'Diner', ['budget', 'gezond', 'licht', 'bbq', 'weekend', 'zondag', 'lauw']],
  ['Lasagne', 'Diner', ['bbq']],
]
const SECTION_OF = Object.fromEntries(DATA.map(([title, section]) => [title, section]))

// Zonder categorie in de database: een eigen categorie zou categories.spec.js beïnvloeden.
// De sectie krijgt een recept pas in de browser.
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  for (const [title, , tags] of DATA) {
    const created = await api.post('/api/recipes', {
      data: {
        recipe: {
          title,
          servings: 2,
          tag_names: tags,
          steps_attributes: [{ body: 'Klaarmaken.' }],
          recipe_ingredients_attributes: [{ ingredient_name: 'bloem', quantity: 100, unit: 'g' }],
        },
      },
    })
    expect(created.status(), await created.text()).toBe(201)
  }
})

// De database zelf wordt leeggemaakt in e2e/global-teardown.js.
test.afterAll(async () => {
  await api.dispose()
})

test('receptenoverzicht: kaarten per sectie op hoogte, gelijke naast elkaar', async ({ page }) => {
  const categories = await (await api.get('/api/categories')).json()
  const category = (name) => categories.find((c) => c.name === name)

  // Alleen de recepten van deze test, elk in zijn sectie; de rest van de response is echt.
  await page.route(
    (url) => url.pathname === '/api/recipes',
    async (route) => {
      const response = await route.fetch()
      const list = (await response.json())
        .filter((recipe) => recipe.title in SECTION_OF)
        .map((recipe) => ({ ...recipe, category: category(SECTION_OF[recipe.title]) }))
      await route.fulfill({ response, json: list })
    },
  )
  await page.goto('/')

  const section = (name) =>
    page.locator('.category-section', { has: page.getByRole('heading', { name }) })
  await expect(section('Ontbijt').locator('h3')).toHaveText([
    'Boterham met kaas',
    'Croissant',
    'Havermout',
    'Yoghurt met granola',
  ])
  // 6 en 7 tags tonen allebei 5 tags plus "+N": even hoog, dus op titel.
  await expect(section('Diner').locator('h3')).toHaveText([
    'Lasagne',
    'Stamppot',
    'Curry',
    'Wokschotel',
  ])

  await page.screenshot({ path: 'e2e/screenshots/kaarten-op-hoogte.png', fullPage: true })

  // Twee kolommen: elk paar staat in dezelfde rij, links en rechts, met evenveel
  // tag-chips. (Exact even hoog is niet gegarandeerd: een titel kan op twee regels
  // vallen, of twee korte chips passen samen op één regel.)
  for (const name of ['Ontbijt', 'Diner']) {
    const cards = await section(name).locator('.recipe-card').all()
    const boxes = await Promise.all(cards.map((card) => card.boundingBox()))
    const chips = await Promise.all(cards.map((card) => card.locator('.tag').count()))
    for (let i = 0; i < cards.length; i += 2) {
      expect(Math.abs(boxes[i].y - boxes[i + 1].y)).toBeLessThanOrEqual(1)
      expect(boxes[i + 1].x).toBeGreaterThan(boxes[i].x)
      expect(chips[i + 1]).toBe(chips[i])
    }
  }
})
