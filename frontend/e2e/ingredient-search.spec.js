import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'

// "Met ingrediënt…" op het receptentabblad, op een iPhone-scherm: zoeken en kiezen,
// de platte lijst in de volgorde van de server, de hints op de kaart, openen met de
// wissel, "Ontbrekende op lijst" en de lege staat. Screenshots in e2e/screenshots/.

let api
const recipeIds = []

const recipe = (title, rows, extra = {}) => ({
  title,
  servings: 2,
  steps_attributes: [{ body: 'Klaarmaken en opdienen.' }],
  recipe_ingredients_attributes: rows,
  ...extra,
})

// Gezocht wordt op halloumi en courgette. Verwachte volgorde: originelen eerst (minst te
// kopen bovenaan), dan via een alternatief, dan optioneel.
const RECIPES = [
  recipe('Halloumiwraps zoeken', [
    { ingredient_name: 'wrap', quantity: 4, unit: 'stuks' },
    { ingredient_name: 'halloumi', quantity: 200, unit: 'g' },
    { ingredient_name: 'sla', quantity: 1, unit: 'stuks' },
    { ingredient_name: 'tomaat', quantity: 2, unit: 'stuks' },
  ]),
  recipe(
    'Gegrilde halloumi zoeken',
    [
      { ingredient_name: 'halloumi', quantity: 250, unit: 'g' },
      { ingredient_name: 'citroen', quantity: 1, unit: 'stuks' },
    ],
    { tag_names: ['snel'] },
  ),
  recipe('Moussaka zoeken', [
    {
      ingredient_name: 'aubergine',
      quantity: 2,
      unit: 'stuks',
      alternatives_attributes: [{ ingredient_name: 'courgette' }],
    },
    { ingredient_name: 'gehakt', quantity: 500, unit: 'g' },
  ]),
  recipe('Groentecurry zoeken', [
    { ingredient_name: 'rijst', quantity: 300, unit: 'g' },
    { ingredient_name: 'kokosmelk', quantity: 400, unit: 'ml' },
    { ingredient_name: 'courgette', optional: true },
  ]),
]

const TITLES = [
  'Gegrilde halloumi zoeken',
  'Halloumiwraps zoeken',
  'Moussaka zoeken',
  'Groentecurry zoeken',
]

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  for (const data of RECIPES) {
    const created = await api.post('/api/recipes', { data: { recipe: data } })
    expect(created.status(), await created.text()).toBe(201)
    recipeIds.push((await created.json()).id)
  }
})

test.beforeEach(async () => {
  expect((await api.post('/api/pantry/reset')).status()).toBe(200)
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
})

test.afterAll(async () => {
  await api.delete('/api/shopping_list_items/clear_all')
  for (const id of recipeIds) await deleteRecipe(api, id)
  await api.dispose()
})

function collectErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function checkLayout(page, errors, name = null) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  if (name) {
    await page.screenshot({
      path: `e2e/screenshots/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  expect(errors, 'geen console-errors').toEqual([])
}

const card = (page, title) => page.locator('.recipe-card', { hasText: title })

// Alleen de recepten van deze spec, in de volgorde op het scherm.
async function ourTitles(page) {
  const titles = await page.locator('.recipe-grid h3').allTextContents()
  return titles.map((title) => title.trim()).filter((title) => TITLES.includes(title))
}

async function choose(page, text, name) {
  const input = page.getByLabel('Met ingrediënt')
  await input.fill(text)
  await page
    .locator('[aria-label="Gevonden ingrediënten"] button', {
      hasText: new RegExp(`^\\s*\\+ ${name}\\s*$`),
    })
    .click()
  await expect(page.locator('[aria-label="Gekozen ingrediënten"]')).toContainText(name)
}

test('zoeken op halloumi en courgette: platte lijst, hints, nog kopen', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto('/')
  await expect(page.locator('.category-section').first()).toBeVisible()
  await choose(page, 'hallou', 'halloumi')
  await choose(page, 'courg', 'courgette')

  await expect(page).toHaveURL(/[?&]met=\d+(%2C|,)\d+/)
  await expect(page.locator('#found-title')).toHaveText('Met halloumi of courgette')
  await expect(page.locator('.category-section')).toHaveCount(0)
  await expect.poll(() => ourTitles(page)).toEqual(TITLES)

  await expect(card(page, 'Gegrilde halloumi').locator('.to-buy')).toHaveText(
    'nog kopen: 1 (citroen)',
  )
  await expect(card(page, 'Halloumiwraps').locator('.to-buy')).toHaveText(
    'nog kopen: 3 (wrap, sla, tomaat)',
  )
  await expect(card(page, 'Moussaka').locator('.match-hint')).toHaveText(
    'met courgette i.p.v. aubergine',
  )
  await expect(card(page, 'Moussaka').locator('.to-buy')).toHaveText('nog kopen: 1 (gehakt)')
  await expect(card(page, 'Groentecurry').locator('.match-hint')).toHaveText('courgette optioneel')
  await checkLayout(page, errors, 'met-ingredient-resultaten')

  // De tag-chip filtert mee, de volgorde blijft.
  await page.locator('.tag-chips .filter-chip', { hasText: /^snel/ }).click()
  await expect.poll(() => ourTitles(page)).toEqual(['Gegrilde halloumi zoeken'])
  await page.locator('.tag-chips .filter-chip', { hasText: /^snel/ }).click()
  await expect.poll(() => ourTitles(page)).toEqual(TITLES)

  // Terug naar de secties als het laatste ingrediënt weg is.
  await page.getByRole('button', { name: 'halloumi weghalen' }).click()
  await expect.poll(() => ourTitles(page)).toEqual(['Moussaka zoeken', 'Groentecurry zoeken'])
  await page.getByRole('button', { name: 'courgette weghalen' }).click()
  await expect(page.locator('.category-section').first()).toBeVisible()
  await expect(page).not.toHaveURL(/met=/)
  await checkLayout(page, errors)
})

test('via een alternatief opent het recept met de wissel actief', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto('/')
  await choose(page, 'courg', 'courgette')
  await card(page, 'Moussaka').locator('a').click()

  await expect(page).toHaveURL(/\/recepten\/\d+\?wissel=\d+(%3A|:)\d+/)
  await expect(page.locator('h1')).toHaveText('Moussaka zoeken')
  // Gewisseld: courgette staat in de lijst, met "↺ aubergine" om terug te zetten.
  await expect(page.getByRole('button', { name: 'Terug naar aubergine' })).toBeVisible()
  await checkLayout(page, errors, 'met-ingredient-recept-gewisseld')

  // Terug: het filter staat er nog.
  await page.goBack()
  await expect(page.locator('#found-title')).toHaveText('Met courgette')
})

test('Ontbrekende op lijst zet alleen wat ontbreekt op de lijst, niet het gekozen ingrediënt', async ({
  page,
}) => {
  const errors = collectErrors(page)

  await page.goto('/')
  await choose(page, 'hallou', 'halloumi')
  await card(page, 'Halloumiwraps').getByRole('button', { name: 'Ontbrekende op lijst' }).click()
  await expect(card(page, 'Halloumiwraps').locator('.added')).toHaveText('Op de lijst ✓')
  await checkLayout(page, errors, 'met-ingredient-op-lijst')

  const items = await (await api.get('/api/shopping_list_items')).json()
  expect(items.map((item) => item.name).sort()).toEqual(['sla', 'tomaat', 'wrap'])
})

test('lege staat noemt de gekozen ingrediënten', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto('/')
  await choose(page, 'citro', 'citroen')
  await page.locator('.category-chips .filter-chip', { hasText: 'Ontbijt' }).click()

  await expect(page.locator('.no-results')).toHaveText('Geen recepten met citroen in Ontbijt')
  await checkLayout(page, errors, 'met-ingredient-leeg')
})
