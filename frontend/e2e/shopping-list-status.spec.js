import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Op de receptpagina zie je welke ingrediënten al op de boodschappenlijst staan: "+ lijst",
// "✓ op lijst" (via dit recept, tik haalt weg) of "✓ via …" (andere herkomst, niet
// klikbaar). Ook na weggaan en terugkomen, want de status komt van de server.
// Screenshots in e2e/screenshots/.

let api
let stirFry
let curry

const STIR_FRY = {
  title: 'Roerbak met kip',
  servings: 2,
  steps_attributes: [{ body: 'Alles kort roerbakken.' }],
  recipe_ingredients_attributes: [
    {
      ingredient_name: 'kipdijfilet',
      quantity: 300,
      unit: 'g',
      alternatives_attributes: [{ ingredient_name: 'tempeh' }],
    },
    { ingredient_name: 'mie', quantity: 200, unit: 'g' },
    { ingredient_name: 'paksoi', quantity: 2, unit: 'stuks' },
    { ingredient_name: 'sojasaus', quantity: 2, unit: 'el' },
    { ingredient_name: 'knoflook', quantity: 2, unit: 'stuks' },
    { ingredient_name: 'sesamzaad', quantity: 1, unit: 'el', optional: true },
  ],
}

// Een ander recept met deels dezelfde ingrediënten, voor "✓ via <recept>".
const CURRY = {
  title: 'Groene curry',
  servings: 2,
  steps_attributes: [{ body: 'Curry koken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'tempeh', quantity: 200, unit: 'g' },
    { ingredient_name: 'paksoi', quantity: 1, unit: 'stuks' },
  ],
}

async function createRecipe(recipe) {
  const created = await api.post('/api/recipes', { data: { recipe } })
  expect(created.status(), await created.text()).toBe(201)
  return created.json()
}

// rowName: de naam van de regel in het andere recept; zet die regel op de lijst.
async function addFromRecipe(recipe, rowName) {
  const row = recipe.ingredients.find((ingredient) => ingredient.name === rowName)
  const response = await api.post(`/api/recipes/${recipe.id}/add_to_shopping_list`, {
    data: { ingredient_ids: [row.id] },
  })
  expect(response.status(), await response.text()).toBe(201)
}

// Zoals de standaardlijst dat doet: een vrije regel zonder recept.
async function addFromStandardList(name) {
  const response = await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name, source_label: 'standaard', recipe_id: null }] },
  })
  expect(response.status(), await response.text()).toBe(201)
}

async function shoppingList() {
  return (await api.get('/api/shopping_list_items')).json()
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  stirFry = await createRecipe(STIR_FRY)
  curry = await createRecipe(CURRY)
  const chicken = stirFry.ingredients.find((row) => row.name === 'kipdijfilet')
  for (const variation of [
    {
      name: 'Met garnalen',
      removed_ingredient_ids: [chicken.id],
      added_ingredients: [{ name: 'garnalen', quantity: 200, unit: 'g' }],
    },
    {
      name: 'Pittig',
      added_ingredients: [
        { name: 'sambal', quantity: null, unit: null },
        { name: 'rode peper', quantity: 1, unit: 'stuks' },
      ],
    },
  ]) {
    const created = await api.post(`/api/recipes/${stirFry.id}/variations`, { data: { variation } })
    expect(created.status(), await created.text()).toBe(201)
  }
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
})

test.afterAll(async () => {
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

// De knop naast een ingrediënt, gevonden via de regel waarin de naam staat.
function listButton(page, name) {
  return page
    .locator('.ingredients > ul > li')
    .filter({ has: page.locator('.line', { hasText: name }) })
    .locator('.list-button')
}

async function openRecipe(page) {
  await page.goto(`/recepten/${stirFry.id}`)
  await expect(page.getByRole('heading', { name: STIR_FRY.title })).toBeVisible()
}

test('a) "+ lijst" wordt "✓ op lijst" en blijft dat na weggaan en terugkomen', async ({ page }) => {
  const errors = collectErrors(page)
  await openRecipe(page)

  await expect(listButton(page, 'mie')).toHaveText('+ lijst')
  await listButton(page, 'mie').click()
  await expect(listButton(page, 'mie')).toHaveText('✓ op lijst')

  // Weg via het menu en terug met "terug" (de app blijft open)...
  await page
    .getByRole('link', { name: /Boodschappen/ })
    .first()
    .click()
  await expect(page.getByText('mie', { exact: false }).first()).toBeVisible()
  await page.goBack()
  await expect(listButton(page, 'mie')).toHaveText('✓ op lijst')

  // ...en na helemaal opnieuw openen: dan komt het van de server.
  await openRecipe(page)
  await expect(listButton(page, 'mie')).toHaveText('✓ op lijst')
  await expect(listButton(page, 'paksoi')).toHaveText('+ lijst')
  expect(errors).toEqual([])
})

test('b) afgestreept op de boodschappenlijst: op het recept weer "+ lijst"', async ({ page }) => {
  await openRecipe(page)
  await listButton(page, 'sojasaus').click()
  await expect(listButton(page, 'sojasaus')).toHaveText('✓ op lijst')

  await page.goto('/boodschappen')
  const row = page.locator('.items li').filter({ hasText: 'sojasaus' })
  await row.getByRole('checkbox').check()
  await expect(row).toHaveClass(/checked/)

  await openRecipe(page)
  await expect(listButton(page, 'sojasaus')).toHaveText('+ lijst')
})

test('c) tik op "✓ op lijst": weg van de lijst, knop terug naar "+ lijst"', async ({ page }) => {
  await openRecipe(page)
  await listButton(page, 'knoflook').click()
  await expect(listButton(page, 'knoflook')).toHaveText('✓ op lijst')
  expect((await shoppingList()).map((item) => item.name)).toEqual(['knoflook'])

  await listButton(page, 'knoflook').click()
  await expect(listButton(page, 'knoflook')).toHaveText('+ lijst')
  await expect(page.getByRole('status')).toHaveText('knoflook is van je boodschappenlijst gehaald.')
  expect(await shoppingList()).toEqual([])
})

test('d) via een ander recept: "✓ via <recept>", niet klikbaar', async ({ page }) => {
  await addFromRecipe(curry, 'paksoi')
  await openRecipe(page)

  const button = listButton(page, 'paksoi')
  await expect(button).toHaveText('✓ via Groene curry')
  await expect(button).toBeDisabled()
  // De regel van het andere recept blijft staan.
  expect((await shoppingList()).map((item) => item.source_label)).toEqual(['Groene curry'])
})

test('e) een gewisseld alternatief: de status volgt het getoonde ingrediënt', async ({ page }) => {
  await addFromRecipe(curry, 'tempeh')
  await openRecipe(page)
  await expect(listButton(page, 'kipdijfilet')).toHaveText('+ lijst')

  await page.getByRole('button', { name: 'Wissel voor tempeh' }).click()
  await expect(listButton(page, 'tempeh')).toHaveText('✓ via Groene curry')

  await page.getByRole('button', { name: 'Terug naar kipdijfilet' }).click()
  await expect(listButton(page, 'kipdijfilet')).toHaveText('+ lijst')
})

test('"Alles op lijst": daarna overal ✓, ook wat er al stond', async ({ page }) => {
  await addFromStandardList('knoflook')
  await openRecipe(page)
  await expect(listButton(page, 'knoflook')).toHaveText('✓ via standaardlijst')

  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  for (const name of ['kipdijfilet', 'mie', 'paksoi', 'sojasaus', 'knoflook']) {
    await expect(listButton(page, name)).toHaveText('✓ op lijst')
  }
  // Optioneel gaat niet mee.
  await expect(listButton(page, 'sesamzaad')).toHaveText('+ lijst')
})

// De knop bij een toevoeging op een variatiekaart.
function additionButton(page, variation, name) {
  return page
    .locator('.variation-card')
    .filter({ hasText: variation })
    .locator('.change.added')
    .filter({ hasText: name })
    .locator('.list-button')
}

test('variaties: "+ lijst" per toevoeging, en "Variatie op lijst" zet overal ✓', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openRecipe(page)

  await expect(additionButton(page, 'Pittig', 'rode peper')).toHaveText('+ lijst')
  await additionButton(page, 'Pittig', 'rode peper').click()
  await expect(additionButton(page, 'Pittig', 'rode peper')).toHaveText('✓ op lijst')
  const peper = (await shoppingList()).find((item) => item.name === 'rode peper')
  expect(peper).toMatchObject({
    quantity: 1,
    unit: 'stuks',
    recipe_id: stirFry.id,
    source_label: 'Roerbak met kip (variatie: Pittig)',
  })

  // Weer weg met een tik.
  await additionButton(page, 'Pittig', 'rode peper').click()
  await expect(additionButton(page, 'Pittig', 'rode peper')).toHaveText('+ lijst')

  await page
    .locator('.variation-card')
    .filter({ hasText: 'Met garnalen' })
    .getByRole('button', { name: 'Variatie op lijst' })
    .click()
  await expect(additionButton(page, 'Met garnalen', 'garnalen')).toHaveText('✓ op lijst')
  for (const name of ['mie', 'paksoi', 'sojasaus', 'knoflook']) {
    await expect(listButton(page, name)).toHaveText('✓ op lijst')
  }
  // De variatie laat de kip weg en sesamzaad is optioneel.
  await expect(listButton(page, 'kipdijfilet')).toHaveText('+ lijst')
  await expect(listButton(page, 'sesamzaad')).toHaveText('+ lijst')

  await page.locator('section.variations').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'e2e/screenshots/recept-op-lijst-variaties.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})

test('screenshot: een mix van ✓ en "+ lijst" op een iPhone', async ({ page }) => {
  const errors = collectErrors(page)
  await addFromStandardList('knoflook')
  await addFromRecipe(curry, 'paksoi')
  await openRecipe(page)
  await listButton(page, 'mie').click()
  await listButton(page, 'kipdijfilet').click()
  await expect(listButton(page, 'kipdijfilet')).toHaveText('✓ op lijst')
  await expect(page.getByRole('status')).toBeHidden({ timeout: 5000 })

  // Niets breder dan het scherm.
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)

  await page.locator('.ingredients').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'e2e/screenshots/recept-op-lijst-status.png',
    animations: 'disabled',
  })
  await page.screenshot({
    path: 'e2e/screenshots/recept-op-lijst-status-hele-pagina.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
