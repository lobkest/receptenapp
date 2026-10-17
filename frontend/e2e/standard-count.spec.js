import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Op de standaardlijst zie je wat al op de boodschappenlijst staat ("✓ op lijst"). Nog eens
// tikken maakt geen nieuwe regel maar telt op: "melk ×2", of bij een receptregel
// "200 ml melk +1". De −-knop op de boodschappenlijst telt weer af.
// Screenshots in e2e/screenshots/.

let api
let pancakes
// De standaarditems die deze test zelf aanmaakte (afterAll ruimt ze op).
const created = []

const PANCAKES = {
  title: 'Teller-pannenkoeken',
  servings: 2,
  steps_attributes: [{ body: 'Beslag maken en bakken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'melk', quantity: 200, unit: 'ml' },
    { ingredient_name: 'bloem', quantity: 125, unit: 'g' },
  ],
}

const STANDARD = [
  { name: 'melk', category: 'zuivel' },
  { name: 'kaas', category: 'zuivel' },
  { name: 'yoghurt', category: 'zuivel' },
  { name: 'brood', category: 'brood' },
  { name: 'wc-papier', category: null },
]

// Bestaat het item al (bijv. uit de import-test), dan gebruiken we dat.
async function ensureStandardItems() {
  const existing = await (await api.get('/api/standard_items')).json()
  for (const item of STANDARD) {
    if (existing.some((other) => other.name === item.name)) continue
    const response = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(response.status(), await response.text()).toBe(201)
    created.push((await response.json()).id)
  }
}

async function shoppingList() {
  return (await api.get('/api/shopping_list_items')).json()
}

async function addFromRecipe(recipe, rowName) {
  const row = recipe.ingredients.find((ingredient) => ingredient.name === rowName)
  const response = await api.post(`/api/recipes/${recipe.id}/add_to_shopping_list`, {
    data: { ingredient_ids: [row.id] },
  })
  expect(response.status(), await response.text()).toBe(201)
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const response = await api.post('/api/recipes', { data: { recipe: PANCAKES } })
  expect(response.status(), await response.text()).toBe(201)
  pancakes = await response.json()
  await ensureStandardItems()
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  // Afvinken zet iets in huis, en wat in huis is slaat "Alles op lijst" over: begin
  // daarom met de standaardvoorraad.
  expect((await api.post('/api/pantry/reset')).status()).toBe(200)
})

test.afterAll(async () => {
  if (created.length) await api.post('/api/standard_items/bulk_destroy', { data: { ids: created } })
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

// De [+]- of "✓ op lijst"-knop van een item op de standaardlijst.
function standardButton(page, name) {
  return page
    .locator('.items li')
    .filter({ has: page.locator('.line', { hasText: new RegExp(`^${name}$`) }) })
    .locator('.add-one')
}

async function openStandard(page) {
  await page.goto('/standaard')
  await expect(standardButton(page, 'melk')).toBeVisible()
}

async function openShoppingList(page) {
  await page.goto('/boodschappen')
  await expect(page.locator('.items')).toBeVisible()
}

function shoppingRow(page, text) {
  return page.locator('.items li').filter({ has: page.locator('.line', { hasText: text }) })
}

function shoppingLines(page) {
  return page.locator('.items li .line')
}

// De knop naast een ingrediënt op de receptpagina.
function recipeButton(page, name) {
  return page
    .locator('.ingredients > ul > li')
    .filter({ has: page.locator('.line', { hasText: name }) })
    .locator('.list-button')
}

test('a) [+] wordt "✓ op lijst"; nog eens tikken geeft één regel "melk ×2"', async ({ page }) => {
  const errors = collectErrors(page)
  await openStandard(page)

  await expect(standardButton(page, 'melk')).toHaveAccessibleName('melk op boodschappenlijst')
  await standardButton(page, 'melk').click()
  await expect(standardButton(page, 'melk')).toHaveText('✓ op lijst')

  await standardButton(page, 'melk').click()
  await expect(page.getByRole('status')).toContainText('Nog een melk op je boodschappenlijst.')

  const list = await shoppingList()
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ name: 'melk', quantity: null, standard_count: 2 })

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['melk ×2'])
  expect(errors).toEqual([])
})

test('b) − telt af naar ×1, nog eens − haalt de regel weg; de standaardlijst toont weer [+]', async ({
  page,
}) => {
  await openStandard(page)
  await standardButton(page, 'kaas').click()
  await expect(standardButton(page, 'kaas')).toHaveText('✓ op lijst')
  await standardButton(page, 'kaas').click()
  await expect(page.getByRole('status')).toContainText('Nog een kaas')

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['kaas ×2'])
  await page.getByRole('button', { name: 'Eén kaas minder' }).click()
  await expect(shoppingLines(page)).toHaveText(['kaas'])
  await page.getByRole('button', { name: 'Eén kaas minder' }).click()
  await expect(page.getByText('Je boodschappenlijst is leeg.')).toBeVisible()
  expect(await shoppingList()).toEqual([])

  await openStandard(page)
  await expect(standardButton(page, 'kaas')).toHaveAccessibleName('kaas op boodschappenlijst')
  await expect(standardButton(page, 'kaas')).not.toHaveText('✓ op lijst')
})

test('c+d) melk via recept: ✓ op de standaardlijst, tik geeft "+1"; recept-✓ weg laat "melk" staan', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await addFromRecipe(pancakes, 'melk')

  // c) Staat er via het recept op: de standaardlijst toont ✓; een tik telt daar op.
  await openStandard(page)
  await expect(standardButton(page, 'melk')).toHaveText('✓ op lijst')
  await standardButton(page, 'melk').click()
  await expect(page.getByRole('status')).toContainText('Nog een melk')

  let list = await shoppingList()
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({
    quantity: 200,
    unit: 'ml',
    recipe_id: pancakes.id,
    standard_count: 1,
  })
  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['200 ml melk +1'])
  await expect(shoppingRow(page, 'melk').locator('.sources')).toHaveText(
    'uit: Teller-pannenkoeken, standaard',
  )

  // d) Op het recept "✓ op lijst" wegtikken: het receptdeel gaat, "melk" blijft.
  await page.goto(`/recepten/${pancakes.id}`)
  await expect(recipeButton(page, 'melk')).toHaveText('✓ op lijst')
  await recipeButton(page, 'melk').click()
  await expect(recipeButton(page, 'melk')).toHaveText('✓ via standaardlijst')

  list = await shoppingList()
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({
    name: 'melk',
    quantity: null,
    unit: null,
    recipe_id: null,
    source_label: 'standaard',
    standard_count: 1,
  })
  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['melk'])
  expect(errors).toEqual([])
})

test('e) afstrepen: de standaardlijst toont weer [+], en een tik maakt een nieuwe regel', async ({
  page,
}) => {
  await openStandard(page)
  await standardButton(page, 'brood').click()
  await expect(standardButton(page, 'brood')).toHaveText('✓ op lijst')

  await openShoppingList(page)
  await shoppingRow(page, 'brood').getByRole('checkbox').check()
  await expect(shoppingRow(page, 'brood')).toHaveClass(/checked/)

  await openStandard(page)
  await expect(standardButton(page, 'brood')).not.toHaveText('✓ op lijst')
  await standardButton(page, 'brood').click()
  await expect(standardButton(page, 'brood')).toHaveText('✓ op lijst')

  const list = await shoppingList()
  expect(list.map((item) => [item.name, item.checked, item.standard_count])).toEqual([
    ['brood', true, 1],
    ['brood', false, 1],
  ])
})

test('f) selectiemodus met een mix: wat er al op staat +1, de rest een nieuwe regel', async ({
  page,
}) => {
  await addFromRecipe(pancakes, 'melk')
  await openStandard(page)
  await standardButton(page, 'yoghurt').click()
  await expect(standardButton(page, 'yoghurt')).toHaveText('✓ op lijst')

  await page.getByRole('button', { name: 'Selecteren' }).click()
  for (const name of ['melk', 'yoghurt', 'wc-papier']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check()
  }
  await page.getByRole('button', { name: 'Op lijst (3)' }).click()
  await expect(page.getByRole('status')).toContainText('3 items op je boodschappenlijst gezet.')

  const list = await shoppingList()
  expect(list.map((item) => [item.name, item.quantity, item.standard_count]).sort()).toEqual([
    ['melk', 200, 1],
    ['wc-papier', null, 1],
    ['yoghurt', null, 2],
  ])

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['200 ml melk +1', 'yoghurt ×2', 'wc-papier'])
})

test('screenshots: standaardlijst (mix ✓ en [+]) en boodschappenlijst (×2, +1, −) op een iPhone', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await addFromRecipe(pancakes, 'melk')
  await addFromRecipe(pancakes, 'bloem')
  await openStandard(page)
  await standardButton(page, 'melk').click()
  await expect(page.getByRole('status')).toContainText('Nog een melk')
  await standardButton(page, 'kaas').click()
  await expect(standardButton(page, 'kaas')).toHaveText('✓ op lijst')
  await standardButton(page, 'kaas').click()
  await expect(page.getByRole('status')).toContainText('Nog een kaas')
  await standardButton(page, 'wc-papier').click()
  await expect(standardButton(page, 'wc-papier')).toHaveText('✓ op lijst')
  await expect(page.getByRole('status')).toBeHidden({ timeout: 5000 })

  const noHorizontalScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await noHorizontalScroll()).toBe(true)

  await page.locator('.group').first().scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'e2e/screenshots/standaardlijst-op-lijst.png',
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Selecteren' }).click()
  await page.screenshot({
    path: 'e2e/screenshots/standaardlijst-op-lijst-selecteren.png',
    animations: 'disabled',
  })

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText([
    '200 ml melk +1',
    '125 g bloem',
    'kaas ×2',
    'wc-papier',
  ])
  expect(await noHorizontalScroll()).toBe(true)
  await page.screenshot({
    path: 'e2e/screenshots/boodschappen-teller.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
