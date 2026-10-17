import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// "In huis" op de receptpagina en de standaardlijst: het huisje naast de lijstknop, aan/uit
// tikken, overslaan bij "Alles op lijst" en "Op lijst (n)", en de wissel-hint.
// Screenshots in e2e/screenshots/.

let api
let curry
// De standaarditems die deze test zelf aanmaakte (afterAll ruimt ze op).
const createdStandard = []

const CURRY = {
  title: 'Huis-curry',
  servings: 2,
  steps_attributes: [{ body: 'Alles samen laten pruttelen.' }],
  recipe_ingredients_attributes: [
    {
      ingredient_name: 'kikkererwten',
      quantity: 400,
      unit: 'g',
      alternatives_attributes: [{ ingredient_name: 'kidneybonen' }, { ingredient_name: 'linzen' }],
    },
    { ingredient_name: 'rode ui', quantity: 100, unit: 'g' },
    { ingredient_name: 'kokosmelk', quantity: 400, unit: 'ml' },
    { ingredient_name: 'spinazie', quantity: 200, unit: 'g' },
    { ingredient_name: 'zout' },
  ],
}

const STANDARD = [
  { name: 'kokosmelk', category: 'houdbaar' },
  { name: 'spinazie', category: 'groente' },
  { name: 'keukenpapier', category: null },
]

async function ingredientId(name) {
  const ingredients = await (await api.get('/api/ingredients')).json()
  return ingredients.find((ingredient) => ingredient.name === name).id
}

async function setInHouse(name, present) {
  const response = await api.patch(`/api/pantry/ingredients/${await ingredientId(name)}`, {
    data: { pantry_item: { present } },
  })
  expect(response.status(), await response.text()).toBe(200)
}

async function pantry() {
  return (await api.get('/api/pantry')).json()
}

async function shoppingList() {
  return (await api.get('/api/shopping_list_items')).json()
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const response = await api.post('/api/recipes', { data: { recipe: CURRY } })
  expect(response.status(), await response.text()).toBe(201)
  curry = await response.json()

  // zout is basisvoorraad.
  const staple = await api.patch(`/api/ingredients/${await ingredientId('zout')}/staple`, {
    data: { ingredient: { staple: true } },
  })
  expect(staple.status(), await staple.text()).toBe(200)

  const existing = await (await api.get('/api/standard_items')).json()
  for (const item of STANDARD) {
    if (existing.some((other) => other.name === item.name)) continue
    const created = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(created.status(), await created.text()).toBe(201)
    createdStandard.push((await created.json()).id)
  }
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  expect((await api.post('/api/pantry/reset')).status()).toBe(200)
})

test.afterAll(async () => {
  await api.post('/api/pantry/reset')
  await api.patch(`/api/ingredients/${await ingredientId('zout')}/staple`, {
    data: { ingredient: { staple: false } },
  })
  if (createdStandard.length) {
    await api.post('/api/standard_items/bulk_destroy', { data: { ids: createdStandard } })
  }
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

async function checkLayout(page, errors, name) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
}

// Een ingrediënt op de receptpagina (op de tekst van de regel).
function recipeRow(page, name) {
  return page
    .locator('.ingredients > ul > li')
    .filter({ has: page.locator('.line', { hasText: name }) })
}

function recipeHouse(page, name) {
  return recipeRow(page, name).locator('.house-button')
}

function standardRow(page, name) {
  return page
    .locator('.items li')
    .filter({ has: page.locator('.line', { hasText: new RegExp(`^${name}$`) }) })
}

async function openRecipe(page) {
  await page.goto(`/recepten/${curry.id}`)
  // De voorraad is binnen zodra het basis-zout zijn huisje heeft.
  await expect(recipeHouse(page, 'zout')).toHaveText('in huis')
}

async function openStandard(page) {
  await page.goto('/standaard')
  await expect(standardRow(page, 'spinazie').locator('.house-button')).toBeVisible()
}

// Elke regel past op één regel: de knoppen staan naast de tekst, niet eronder.
async function expectSingleLineRows(page, selector) {
  for (const row of await page.locator(selector).all()) {
    const height = await row.evaluate((element) => element.getBoundingClientRect().height)
    expect(height, await row.textContent()).toBeLessThan(60)
  }
}

test('a) in voorraad: receptpagina en standaardlijst tonen "in huis"', async ({ page }) => {
  await setInHouse('kokosmelk', true)

  await openRecipe(page)
  await expect(recipeHouse(page, 'kokosmelk')).toHaveText('in huis')
  await expect(recipeHouse(page, 'spinazie')).toHaveText('')
  await expect(recipeHouse(page, 'spinazie')).toHaveAttribute(
    'aria-label',
    'spinazie is niet in huis; tik om in de voorraad te zetten',
  )

  await openStandard(page)
  await expect(standardRow(page, 'kokosmelk').locator('.house-button')).toHaveText('in huis')
  await expect(standardRow(page, 'spinazie').locator('.house-button')).toHaveText('')
  // keukenpapier is geen ingrediënt: geen huisje.
  await expect(standardRow(page, 'keukenpapier').locator('.house-button')).toHaveCount(0)
})

test('b) huisje wegtikken op de receptpagina; In huis klopt; terug klopt ook', async ({ page }) => {
  await setInHouse('kokosmelk', true)
  await openRecipe(page)

  await recipeHouse(page, 'kokosmelk').click()
  await expect(recipeHouse(page, 'kokosmelk')).toHaveText('')
  await expect
    .poll(async () => (await pantry()).in_house.map((ingredient) => ingredient.name))
    .not.toContain('kokosmelk')

  await page.getByRole('link', { name: 'In huis' }).click()
  await expect(page.locator('h1')).toHaveText('In huis')
  await expect(page.locator('.intro, .in-house').first()).toBeVisible()
  await expect(page.locator('.in-house li', { hasText: 'kokosmelk' })).toHaveCount(0)

  await page.goBack()
  await expect(recipeHouse(page, 'kokosmelk')).toHaveText('')
  await expect(recipeHouse(page, 'zout')).toHaveText('in huis')
})

test('c) "Alles op lijst" slaat 2 in-huis over en meldt dat; de losse "+ lijst" voegt wel toe', async ({
  page,
}) => {
  await setInHouse('kokosmelk', true)
  await openRecipe(page)

  await page.locator('.add-all').click()
  await expect(page.locator('.ingredients .added')).toHaveText('3 toegevoegd, 2 al in huis.')
  expect((await shoppingList()).map((item) => item.name).sort()).toEqual([
    'kikkererwten',
    'rode ui',
    'spinazie',
  ])

  await recipeRow(page, 'kokosmelk').locator('.list-button').click()
  await expect(recipeRow(page, 'kokosmelk').locator('.list-button')).toHaveText('✓ op lijst')
  // Beide tegelijk zichtbaar: in huis én op de lijst.
  await expect(recipeHouse(page, 'kokosmelk')).toHaveText('in huis')
  expect((await shoppingList()).map((item) => item.name)).toContain('kokosmelk')
})

test('d) afstrepen op de boodschappenlijst zet het in huis; het recept toont "in huis"', async ({
  page,
}) => {
  const row = curry.ingredients.find((ingredient) => ingredient.name === 'rode ui')
  const added = await api.post(`/api/recipes/${curry.id}/add_to_shopping_list`, {
    data: { ingredient_ids: [row.id] },
  })
  expect(added.status()).toBe(201)

  await page.goto('/boodschappen')
  await page.locator('.items li', { hasText: 'rode ui' }).locator('input[type="checkbox"]').check()
  await expect
    .poll(async () => (await pantry()).in_house.map((ingredient) => ingredient.name))
    .toContain('rode ui')

  await page.getByRole('link', { name: 'Recepten' }).click()
  await openRecipe(page)
  await expect(recipeHouse(page, 'rode ui')).toHaveText('in huis')
})

test('e) alternatief in huis: hint, een tik wisselt en zet de URL', async ({ page }) => {
  await setInHouse('kidneybonen', true)
  await setInHouse('linzen', true)
  await openRecipe(page)

  const hint = recipeRow(page, 'kikkererwten').locator('.house-hint')
  await expect(hint).toHaveText('kidneybonen in huis → wissel (+1)')
  await hint.click()

  await expect(page).toHaveURL(/wissel=\d+%3A\d+|wissel=\d+:\d+/)
  await expect(recipeRow(page, 'kidneybonen').locator('.line')).toHaveText('400 g kidneybonen')
  await expect(recipeHouse(page, 'kidneybonen')).toHaveText('in huis')
  await expect(page.locator('.house-hint')).toHaveCount(0)
})

test('f) basisvoorraad zout: label zichtbaar, wegtikken werkt', async ({ page }) => {
  await openRecipe(page)
  await expect(recipeHouse(page, 'zout')).toHaveText('in huis')

  await recipeHouse(page, 'zout').click()
  await expect(recipeHouse(page, 'zout')).toHaveText('')
  await expect
    .poll(async () => (await pantry()).staples.find((staple) => staple.name === 'zout').present)
    .toBe(false)

  await page.reload()
  await expect(recipeRow(page, 'kokosmelk').locator('.house-button')).toBeVisible()
  await expect(recipeHouse(page, 'zout')).toHaveText('')
})

test('g) standaardlijst, selectiemodus met een mix: in-huis wordt overgeslagen', async ({
  page,
}) => {
  await setInHouse('kokosmelk', true)
  await openStandard(page)

  await page.locator('.start-selecting').click()
  for (const name of ['kokosmelk', 'spinazie', 'keukenpapier']) {
    await standardRow(page, name).locator('input[type="checkbox"]').check()
  }
  await expect(standardRow(page, 'kokosmelk').locator('.in-house-tag')).toHaveText('in huis')
  await page.getByRole('button', { name: 'Op lijst (3)' }).click()

  await expect(page.getByRole('status')).toContainText('2 toegevoegd, 1 al in huis.')
  expect((await shoppingList()).map((item) => item.name).sort()).toEqual([
    'keukenpapier',
    'spinazie',
  ])
})

test('screenshots: receptpagina met een mix en de standaardlijst', async ({ page }) => {
  const errors = collectErrors(page)
  // kokosmelk: alleen in huis. rode ui: in huis én op de lijst. spinazie: alleen op de lijst.
  // kikkererwten: niets, maar kidneybonen is in huis (hint). zout: basis.
  await setInHouse('kokosmelk', true)
  await setInHouse('rode ui', true)
  await setInHouse('kidneybonen', true)
  const ids = curry.ingredients
    .filter((ingredient) => ['rode ui', 'spinazie'].includes(ingredient.name))
    .map((ingredient) => ingredient.id)
  await api.post(`/api/recipes/${curry.id}/add_to_shopping_list`, { data: { ingredient_ids: ids } })

  await openRecipe(page)
  await expect(recipeRow(page, 'spinazie').locator('.list-button')).toHaveText('✓ op lijst')
  await expect(recipeRow(page, 'rode ui').locator('.list-button')).toHaveText('✓ op lijst')
  await expect(recipeHouse(page, 'rode ui')).toHaveText('in huis')
  await expect(recipeRow(page, 'kikkererwten').locator('.house-hint')).toBeVisible()
  await expectSingleLineRows(page, '.ingredients > ul > li .main')
  await page.locator('.ingredients').scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'in-huis-receptpagina')

  await openStandard(page)
  await expect(standardRow(page, 'spinazie').locator('.add-one')).toHaveText('✓ op lijst')
  await expectSingleLineRows(page, '.items li')
  await checkLayout(page, errors, 'in-huis-standaardlijst')
})
