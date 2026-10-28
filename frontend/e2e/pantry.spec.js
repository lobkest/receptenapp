import { test, expect, devices } from '@playwright/test'
import { PWA_URL, RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'
import { checkLayout, collectErrors, ingredientId, setInHouse } from './helpers.js'

// "In huis" op een iPhone-scherm: voorraad aanpassen, recepten die verschuiven tussen
// "Mist 1" en "Alles in huis", "Ontbrekende op lijst", en afstrepen op de
// boodschappenlijst dat de voorraad bijwerkt (ook offline, via de wachtrij). Plus de
// schakelaar Basis op het bewerkscherm. Screenshots in e2e/screenshots/.

let api
let recipeId

// Uien en tomaat moet je hebben; zout (basis) staat standaard in huis, peterselie is optioneel.
const SOUP = {
  title: 'Tomatensoep In huis',
  servings: 3,
  steps_attributes: [{ body: 'Ui fruiten, tomaat erbij, zout, koken en pureren.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'ui', quantity: 1, unit: 'stuks' },
    { ingredient_name: 'tomaat', quantity: 500, unit: 'g' },
    { ingredient_name: 'zout', quantity: 1, unit: 'tl' },
    { ingredient_name: 'peterselie', optional: true },
  ],
}

async function setStaple(name, staple) {
  const response = await api.patch(`/api/ingredients/${await ingredientId(api, name)}/staple`, {
    data: { ingredient: { staple } },
  })
  expect(response.status(), await response.text()).toBe(200)
}

async function inHouseNames() {
  const pantry = await (await api.get('/api/pantry')).json()
  return pantry.in_house.map((item) => item.name)
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const created = await api.post('/api/recipes', { data: { recipe: SOUP } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
  await setStaple('zout', true)
})

test.beforeEach(async () => {
  expect((await api.post('/api/pantry/reset')).status()).toBe(200)
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  await setInHouse(api, 'ui', true)
})

test.afterAll(async () => {
  await api.post('/api/pantry/reset')
  await api.delete('/api/shopping_list_items/clear_all')
  await setStaple('zout', false)
  await deleteRecipe(api, recipeId)
  await api.dispose()
})

function group(page, title) {
  return page.locator('.match-group', { has: page.locator('.group-title', { hasText: title }) })
}

function soupIn(page, title) {
  return group(page, title).locator('.match', { hasText: SOUP.title })
}

test('voorraad aanpassen: het recept verschuift van "Mist 1" naar "Alles in huis"', async ({
  page,
}) => {
  const errors = collectErrors(page)

  await page.goto('/in-huis')
  await expect(soupIn(page, 'Mist 1')).toContainText('mist: tomaat')
  await expect(page.locator('.in-house li')).toHaveText([/ui/])
  // Optionele peterselie telt niet mee; zout is basis en dus in huis.
  await expect(soupIn(page, 'Mist 1')).not.toContainText('peterselie')
  await expect(page.locator('.main-nav')).toContainText('In huis')
  await checkLayout(page, errors, 'in-huis-resultaten')

  // Zoeken en met Enter in huis zetten.
  // Andere specs maken ook "trostomaat" en zo; wat precies zo heet, staat bovenaan.
  await page.getByLabel('Ingrediënt in huis zetten').fill('tomaat')
  await expect(page.locator('.matches-found li').first()).toHaveText('+ tomaat')
  await page.getByLabel('Ingrediënt in huis zetten').press('Enter')
  await expect(soupIn(page, 'Alles in huis')).toBeVisible()
  await expect(soupIn(page, 'Alles in huis').locator('.add-missing')).toHaveCount(0)
  expect(await inHouseNames()).toEqual(['tomaat', 'ui'])

  // Zout is op: het recept mist weer iets. Basis is ingeklapt.
  const staples = page.locator('details.staples')
  await staples.locator('summary').click()
  await staples.getByRole('button', { name: 'zout is op' }).click()
  await expect(soupIn(page, 'Mist 1')).toContainText('mist: zout')
  await expect(staples.getByRole('button', { name: 'zout weer in huis' })).toContainText('↺')
  await expect(staples.locator('summary')).toContainText('1 op')
  await checkLayout(page, errors, 'in-huis-voorraad-basis')

  // Terug naar standaard, met bevestiging: alleen de basis in huis.
  await page.getByRole('button', { name: 'Terug naar standaard' }).click()
  await page.locator('.confirm-dialog .confirm').click()
  await expect(soupIn(page, 'Mist 2')).toContainText('mist: ui, tomaat')
  await expect(page.locator('.in-house')).toHaveCount(0)
  await expect(page.locator('.intro')).toBeVisible()
  await checkLayout(page, errors)
})

test('Ontbrekende op lijst, afstrepen zet het in huis, weer aanvinken haalt het eruit', async ({
  page,
}) => {
  const errors = collectErrors(page)

  await page.goto('/in-huis')
  await soupIn(page, 'Mist 1').getByRole('button', { name: 'Ontbrekende op lijst' }).click()
  await expect(soupIn(page, 'Mist 1').locator('.added')).toHaveText('Op de lijst ✓')

  // Het origineel, voor de porties van het recept (3), uit het recept.
  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Boodschappen/ })
    .click()
  const line = page.locator('.items li', { hasText: 'tomaat' })
  await expect(line.locator('.line')).toHaveText('500 g tomaat')
  await expect(line.locator('.sources')).toHaveText(`uit: ${SOUP.title}`)

  // Afstrepen: in huis.
  await line.locator('input[type="checkbox"]').check()
  await expect.poll(inHouseNames).toEqual(['tomaat', 'ui'])
  await page.locator('.main-nav').getByRole('link', { name: 'In huis' }).click()
  await expect(soupIn(page, 'Alles in huis')).toBeVisible()
  await expect(page.locator('.in-house li')).toHaveText([/tomaat/, /ui/])

  // Weer aanvinken: eruit, want het afstrepen had het in huis gezet.
  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Boodschappen/ })
    .click()
  await line.locator('input[type="checkbox"]').uncheck()
  await expect.poll(inHouseNames).toEqual(['ui'])
  await page.locator('.main-nav').getByRole('link', { name: 'In huis' }).click()
  await expect(soupIn(page, 'Mist 1')).toContainText('mist: tomaat')
  await checkLayout(page, errors)
})

test('offline afstrepen: na de verbinding komt het via de wachtrij alsnog in huis', async ({
  browser,
}) => {
  const created = await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'tomaat', source_label: 'standaard' }] },
  })
  expect(created.status()).toBe(201)

  const context = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    baseURL: PWA_URL,
  })
  const page = await context.newPage()
  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toHaveText(['tomaat'])
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  await page.locator('.items input[type="checkbox"]').check()
  await expect(page.locator('.offline-notice')).toBeVisible()
  expect(await inHouseNames()).toEqual(['ui'])

  await context.setOffline(false)
  await expect.poll(inHouseNames).toEqual(['tomaat', 'ui'])
  await context.close()
})

test('bewerkscherm: de schakelaar Basis, los van het NEVO-formulier', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto(`/ingredienten/${await ingredientId(api, 'tomaat')}`)
  const toggle = page.getByRole('checkbox', { name: /Basis/ })
  await expect(toggle).not.toBeChecked()
  await toggle.check()
  await expect(page.locator('.staple [role="status"]')).toHaveText('Staat nu in de basis.')
  await expect(page.locator('#staple')).toBeChecked()
  await page.locator('.staple').scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'ingredient-basis')

  // Op "In huis" staat tomaat nu bij de basis, en op de ingrediëntenpagina in het filter.
  await page.goto('/ingredienten?filter=basis')
  await expect(page.locator('.ingredient-list .name')).toHaveText(['tomaat', 'zout'])
  await page.goto('/in-huis')
  await page.locator('details.staples summary').click()
  await expect(page.locator('details.staples li')).toHaveText([/tomaat/, /zout/])
  await expect(soupIn(page, 'Alles in huis')).toBeVisible()

  await setStaple('tomaat', false)
  await checkLayout(page, errors)
})
