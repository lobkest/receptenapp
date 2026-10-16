import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Receptkaarten zonder foto (geen leeg fotovak, geen porties), ingrediënten zonder
// hoeveelheid (alleen de naam) en de eenheden tl/el, op een iPhone-scherm.
// Screenshots in e2e/screenshots/ om zelf te bekijken.

let api
const recipes = {}
// Zonder categorie: een eigen categorie zou de tests in categories.spec.js beïnvloeden.

function recipeData(title, ingredients, extra = {}) {
  return {
    recipe: {
      title,
      servings: 4,
      steps_attributes: [{ body: 'Alles mengen.' }],
      recipe_ingredients_attributes: ingredients,
      ...extra,
    },
  }
}

const SIMPLE = [{ ingredient_name: 'bloem', quantity: 250, unit: 'g' }]

// De API kent nog geen foto's; de kaart wel (image_url). Een paar recepten krijgen er
// daarom in de browser een, zodat het overzicht een mix van kaarten met en zonder foto toont.
const WITH_PHOTO = ['Shakshuka', 'Bananenbrood']
const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><defs><linearGradient id="g">` +
      `<stop offset="0" stop-color="#e8a15c"/><stop offset="1" stop-color="#b5532c"/>` +
      `</linearGradient></defs><rect width="4" height="3" fill="url(#g)"/></svg>`,
  )

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const data = [
    recipeData('Shakshuka', SIMPLE, { tag_names: ['vega', 'snel'] }),
    recipeData('Tomatensoep', SIMPLE, { tag_names: ['vega'] }),
    recipeData('Bananenbrood', SIMPLE, { tag_names: ['zoet'] }),
    recipeData('Kruidige linzen met een wat langere titel', SIMPLE),
    recipeData('Pannenkoeken met kaneel', [
      { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
      { ingredient_name: 'olie', quantity: 1, unit: 'el' },
      { ingredient_name: 'kaneel', quantity: 0.5, unit: 'tl' },
      { ingredient_name: 'zout', quantity: null, unit: null },
      { ingredient_name: 'poedersuiker', quantity: null, unit: null, optional: true },
    ]),
  ]
  for (const body of data) {
    const created = await api.post('/api/recipes', { data: body })
    expect(created.status(), await created.text()).toBe(201)
    const recipe = await created.json()
    recipes[recipe.title] = recipe.id
  }
})

// De database zelf wordt leeggemaakt in e2e/global-teardown.js.
test.afterAll(async () => {
  await api.dispose()
})

test('receptenoverzicht: kaarten met en zonder foto, zonder porties', async ({ page }) => {
  // Alleen de recepten van deze test, met foto's erbij; de rest van de response is echt.
  await page.route(
    (url) => url.pathname === '/api/recipes',
    async (route) => {
      const response = await route.fetch()
      const list = (await response.json())
        .filter((recipe) => recipe.title in recipes)
        .map((recipe) => ({
          ...recipe,
          image_url: WITH_PHOTO.includes(recipe.title) ? PHOTO : null,
        }))
      await route.fulfill({ response, json: list })
    },
  )
  await page.goto('/')

  const cards = page.locator('.recipe-card')
  await expect(cards).toHaveCount(5)
  await expect(page.locator('.recipe-card img')).toHaveCount(2)
  await expect(page.locator('.recipe-card .media')).toHaveCount(2)
  await expect(page.locator('.recipe-grid')).not.toContainText('portie')

  // Zonder foto staat de titel direct bovenaan de kaart, zonder lege ruimte erboven.
  const plain = cards.filter({ hasText: 'Tomatensoep' })
  const cardBox = await plain.boundingBox()
  const titleBox = await plain.locator('.title').boundingBox()
  expect(titleBox.y - cardBox.y).toBeLessThan(20)

  // Elke kaart is zo hoog als zijn inhoud: zonder foto korter, ook naast een kaart met
  // foto in dezelfde rij (geen uitgerekt leeg vlak). Beide beginnen bovenaan de rij.
  const photoCard = await cards.filter({ hasText: 'Shakshuka' }).boundingBox()
  expect(cardBox.height).toBeLessThan(photoCard.height / 2)
  expect(Math.abs(cardBox.y - photoCard.y)).toBeLessThanOrEqual(1)

  await page.screenshot({ path: 'e2e/screenshots/kaarten-met-en-zonder-foto.png', fullPage: true })
})

test('receptpagina: zonder hoeveelheid alleen de naam, tl en el schalen mee', async ({ page }) => {
  await page.goto(`/recepten/${recipes['Pannenkoeken met kaneel']}`)

  const lines = page.locator('.ingredients .line')
  await expect(lines).toHaveText([
    '250 g bloem',
    '1 el olie',
    '0,5 tl kaneel',
    'zout',
    'poedersuiker (optioneel)',
  ])
  await page.screenshot({ path: 'e2e/screenshots/recept-zonder-hoeveelheid.png', fullPage: true })

  await page.getByRole('button', { name: 'Meer porties' }).click()
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(page.locator('.servings-count')).toHaveText('6 porties')
  await expect(lines).toHaveText([
    '375 g bloem',
    '1,5 el olie',
    '0,8 tl kaneel',
    'zout',
    'poedersuiker (optioneel)',
  ])
  const text = await page.locator('.ingredients ul').innerText()
  expect(text).not.toMatch(/naar smaak|NaN|undefined/)
  await page.screenshot({
    path: 'e2e/screenshots/recept-zonder-hoeveelheid-6-porties.png',
    fullPage: true,
  })
})

test('insturen: een nieuwe ingrediëntregel staat op stuks, met tl en el als keuze', async ({
  page,
}) => {
  await page.goto('/recepten/nieuw')
  await page.getByRole('button', { name: '+ ingrediënt' }).click()

  for (const index of [1, 2]) {
    const unit = page.getByLabel(`Eenheid ingrediënt ${index}`)
    await expect(unit).toHaveValue('stuks')
  }
  await expect(page.getByLabel('Eenheid ingrediënt 2').locator('option')).toHaveText([
    'g',
    'ml',
    'stuks',
    'tl',
    'el',
  ])

  await page.getByLabel('Eenheid ingrediënt 2').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/screenshots/insturen-nieuwe-regel-stuks.png' })
})
