import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import {
  addFromRecipe,
  collectErrors,
  countInput,
  ingredientRow,
  openShoppingList,
  shoppingList,
  shoppingRow,
} from './helpers.js'

// Op de standaardlijst zie je wat al op de boodschappenlijst staat ("✓ op lijst"). Nog eens
// tikken maakt geen nieuwe regel maar telt op bij het aantal: "melk" met 2 in de stepper, of
// bij een receptregel "400 ml melk (×2)". De stepper zelf: e2e/shopping-list-count.spec.js.
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

function shoppingLines(page) {
  return page.locator('.items li .line')
}

// De knop naast een ingrediënt op de receptpagina.
function recipeButton(page, name) {
  return ingredientRow(page, name).locator('.list-button')
}

test('a) [+] wordt "✓ op lijst"; nog eens tikken geeft één regel "melk" met aantal 2', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openStandard(page)

  await expect(standardButton(page, 'melk')).toHaveAccessibleName('melk op boodschappenlijst')
  await standardButton(page, 'melk').click()
  await expect(standardButton(page, 'melk')).toHaveText('✓ op lijst')

  await standardButton(page, 'melk').click()
  await expect(page.getByRole('status')).toContainText('Nog een melk op je boodschappenlijst.')

  const list = await shoppingList(api)
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ name: 'melk', quantity: null, count: 2 })

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['melk'])
  await expect(countInput(page, 'melk')).toHaveValue('2')
  expect(errors).toEqual([])
})

test('b) − telt af tot 1 en staat dan uit; ✕ haalt de regel weg, de standaardlijst toont weer [+]', async ({
  page,
}) => {
  await openStandard(page)
  await standardButton(page, 'kaas').click()
  await expect(standardButton(page, 'kaas')).toHaveText('✓ op lijst')
  await standardButton(page, 'kaas').click()
  await expect(page.getByRole('status')).toContainText('Nog een kaas')

  await openShoppingList(page)
  await expect(countInput(page, 'kaas')).toHaveValue('2')
  await page.getByRole('button', { name: 'Eén kaas minder' }).click()
  await expect(countInput(page, 'kaas')).toHaveValue('1')
  await expect(page.getByRole('button', { name: 'Eén kaas minder' })).toBeDisabled()
  await expect.poll(async () => (await shoppingList(api))[0]?.count).toBe(1)
  await page.getByRole('button', { name: 'kaas verwijderen' }).click()
  await expect(page.locator('.empty')).toBeVisible()
  expect(await shoppingList(api)).toEqual([])

  await openStandard(page)
  await expect(standardButton(page, 'kaas')).toHaveAccessibleName('kaas op boodschappenlijst')
  await expect(standardButton(page, 'kaas')).not.toHaveText('✓ op lijst')
})

test('c+d) melk via recept: ✓ op de standaardlijst, tik geeft "(×2)"; recept-✓ weg laat "melk" staan', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await addFromRecipe(api, pancakes, 'melk')

  // c) Staat er via het recept op: de standaardlijst toont ✓; een tik telt daar op.
  await openStandard(page)
  await expect(standardButton(page, 'melk')).toHaveText('✓ op lijst')
  await standardButton(page, 'melk').click()
  await expect(page.getByRole('status')).toContainText('Nog een melk')

  let list = await shoppingList(api)
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({
    quantity: 200,
    unit: 'ml',
    recipe_id: pancakes.id,
    count: 2,
    standard_count: 1,
  })
  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['400 ml melk (×2)'])
  await expect(shoppingRow(page, 'melk').locator('.sources')).toHaveText(
    'uit: Teller-pannenkoeken, standaard',
  )

  // d) Op het recept "✓ op lijst" wegtikken: het receptdeel gaat, "melk" blijft (één minder).
  await page.goto(`/recepten/${pancakes.id}`)
  await expect(recipeButton(page, 'melk')).toHaveText('✓ op lijst')
  await recipeButton(page, 'melk').click()
  await expect(recipeButton(page, 'melk')).toHaveCount(0)
  await expect(ingredientRow(page, 'melk').locator('.via-source')).toHaveText('via standaard')

  list = await shoppingList(api)
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({
    name: 'melk',
    quantity: null,
    unit: null,
    recipe_id: null,
    source_label: 'standaard',
    count: 1,
  })
  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['melk'])
  await expect(countInput(page, 'melk')).toHaveValue('1')
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

  const list = await shoppingList(api)
  expect(list.map((item) => [item.name, item.checked, item.count])).toEqual([
    ['brood', true, 1],
    ['brood', false, 1],
  ])
})

test('f) selectiemodus met een mix: wat er al op staat één meer, de rest een nieuwe regel', async ({
  page,
}) => {
  await addFromRecipe(api, pancakes, 'melk')
  await openStandard(page)
  await standardButton(page, 'yoghurt').click()
  await expect(standardButton(page, 'yoghurt')).toHaveText('✓ op lijst')

  await page.getByRole('button', { name: 'Selecteren' }).click()
  for (const name of ['melk', 'yoghurt', 'wc-papier']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check()
  }
  await page.getByRole('button', { name: 'Op lijst (3)' }).click()
  await expect(page.getByRole('status')).toContainText('3 items op je boodschappenlijst gezet.')

  const list = await shoppingList(api)
  expect(list.map((item) => [item.name, item.quantity, item.count]).sort()).toEqual([
    ['melk', 200, 2],
    ['wc-papier', null, 1],
    ['yoghurt', null, 2],
  ])

  await openShoppingList(page)
  await expect(shoppingLines(page)).toHaveText(['400 ml melk (×2)', 'yoghurt', 'wc-papier'])
  await expect(countInput(page, 'yoghurt')).toHaveValue('2')
})

test('screenshots: standaardlijst (mix ✓ en [+]) en boodschappenlijst (steppers) op een iPhone', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await addFromRecipe(api, pancakes, 'melk')
  await addFromRecipe(api, pancakes, 'bloem')
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
    // Per categorie: zuivel, daarna overig.
    '400 ml melk (×2)',
    'kaas',
    '125 g bloem',
    'wc-papier',
  ])
  await expect(page.locator('.category-title')).toHaveText(['zuivel', 'overig'])
  // "uit: …" staat naast de naam (afgekapt als het niet past), dus elke rij is één regel
  // hoog: de stepperknoppen van 44 px plus wat ruimte.
  for (const height of await page
    .locator('.items li')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))) {
    expect(height).toBeLessThan(50)
  }
  expect(await noHorizontalScroll()).toBe(true)
  await page.screenshot({
    path: 'e2e/screenshots/boodschappen-teller.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
