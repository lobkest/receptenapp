import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, ingredientId, iphone } from './helpers.js'

// Een standaarditem koppelen aan een ingrediënt met een andere naam ("e2e-uien" is
// "e2e-ui"): "Mogelijk hetzelfde" bovenaan de standaardlijst, daarna kloppen het huisje en
// "✓ op lijst" via het ingrediënt. Op een iPhone-scherm; screenshots in
// e2e/screenshots/standaard-koppelen-*.png.

const ITEM = 'e2e-uien'
const INGREDIENT = 'e2e-ui'
let api

async function standardItems() {
  return (await api.get('/api/standard_items')).json()
}

async function removeStandard(name) {
  const item = (await standardItems()).find((i) => i.name === name)
  if (item) await api.delete(`/api/standard_items/${item.id}`)
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  await removeStandard(ITEM)
  // Het ingrediënt, in huis (op naam: maakt het aan als het er nog niet is).
  const pantry = await api.patch('/api/pantry/ingredients', {
    data: { pantry_item: { name: INGREDIENT, present: true } },
  })
  expect(pantry.status(), await pantry.text()).toBe(200)
  const created = await api.post('/api/standard_items', {
    data: { standard_item: { name: ITEM, category: 'groente' } },
  })
  expect(created.status(), await created.text()).toBe(201)
  // Het ingrediënt op de boodschappenlijst (krijgt het ingredient_id op naam). Het zet de
  // naam ook onder Tijdelijk; die halen we weg, zodat alleen het item zelf te zien is.
  const added = await api.post('/api/shopping_list_items/add', { data: { name: INGREDIENT } })
  expect(added.status(), await added.text()).toBe(201)
  await removeStandard(INGREDIENT)
})

test.afterAll(async () => {
  await api.delete('/api/shopping_list_items/clear_all')
  await removeStandard(ITEM)
  await removeStandard(INGREDIENT)
  await api.dispose()
})

test('"Ja, hetzelfde" koppelt; dan kloppen het huisje en "✓ op lijst"', async ({ browser }) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page)
  await page.goto('/standaard')

  const row = page.locator('.items li').filter({ has: page.locator('.line', { hasText: ITEM }) })
  await expect(row.locator('.house-button')).toHaveAttribute('aria-pressed', 'false')
  await expect(row.locator('.on-list')).toHaveCount(0)

  // Andere specs kunnen ingrediënten achterlaten die ook op "e2e-uien" lijken (zoals "ui"
  // uit layout.spec.js); het gaat hier om dit ene paar.
  const block = page.locator('details.link-suggestions')
  await expect(block.locator('summary')).toContainText('Mogelijk hetzelfde')
  await checkLayout(page, errors, 'standaard-koppelen-dicht', { fullPage: false })
  await block.locator('summary').click()
  const pair = block.locator(`.link-pair:has-text("${ITEM} ↔ ${INGREDIENT}")`)
  await expect(pair).toHaveCount(1)
  await checkLayout(page, errors, 'standaard-koppelen-suggestie', { fullPage: false })

  await pair.locator('.accept-link').click()
  await expect(block).toHaveCount(0)
  await expect(row.locator('.house-button')).toHaveAttribute('aria-pressed', 'true')
  await expect(row.locator('.on-list')).toBeVisible()
  const item = (await standardItems()).find((i) => i.name === ITEM)
  expect(item.ingredient_id).toBe(await ingredientId(api, INGREDIENT))
  await checkLayout(page, errors, 'standaard-koppelen-gekoppeld', { fullPage: false })

  await row.locator('.edit').click()
  const form = page.locator('.items form')
  await expect(form.locator('.linked-name')).toHaveText(INGREDIENT)
  await expect(form.locator('.unlink')).toBeEnabled()
  await checkLayout(page, errors, 'standaard-koppelen-bewerken', { fullPage: false })

  await context.close()
})
