import { gzipSync } from 'node:zlib'
import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import {
  checkLayout,
  collectErrors,
  ingredientRow,
  iphone,
  openOnline,
  postRecipe,
  setInHouse,
  shoppingList,
  shoppingRow,
} from './helpers.js'

// Offline recepten, standaardlijst en wijzigingen die synchroniseren zodra er weer
// verbinding is: op de gebouwde app (met service worker), op een iPhone-scherm, tegen de
// testdatabase. De database blijft de bron van waarheid: na de sync kijken we daar.

let api
let recipe

const RECIPE = {
  title: 'Offline-pannenkoeken',
  servings: 4,
  steps_attributes: [{ body: 'Beslag maken en bakken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
    { ingredient_name: 'melk', quantity: 500, unit: 'ml' },
    { ingredient_name: 'ei', quantity: 2, unit: 'stuks' },
    { ingredient_name: 'poedersuiker', optional: true },
  ],
}

// Alles wat deze spec op de standaardlijst zet, begint zo (afterEach ruimt het op).
const PREFIX = 'offline-'

async function cleanUp() {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const items = await (await api.get('/api/standard_items')).json()
  const ids = items.filter((item) => item.name.startsWith(PREFIX)).map((item) => item.id)
  if (ids.length) await api.post('/api/standard_items/bulk_destroy', { data: { ids } })
}

async function standardItem(name) {
  const response = await api.post('/api/standard_items', { data: { standard_item: { name } } })
  expect(response.status(), await response.text()).toBe(201)
  return response.json()
}

function pendingText(page) {
  return page.locator('.offline-extra .pending')
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  recipe = await postRecipe(api, RECIPE)
  const variation = await api.post(`/api/recipes/${recipe.id}/variations`, {
    data: {
      variation: {
        name: 'Met spek',
        added_ingredients: [{ name: 'spek', quantity: 100, unit: 'g' }],
      },
    },
  })
  expect(variation.status(), await variation.text()).toBe(201)
})

test.beforeEach(cleanUp)

test.afterEach(async () => {
  await cleanUp()
  await setInHouse(api, 'ei', false)
})

test.afterAll(async () => {
  await api.dispose()
})

test('snapshot: één JSON met ETag; ongewijzigd is een 304 zonder body', async () => {
  const first = await api.get('/api/offline_snapshot')
  expect(first.status()).toBe(200)
  const body = await first.body()
  const snapshot = JSON.parse(body.toString())
  expect(snapshot.recipes.find((r) => r.id === recipe.id).variations).toHaveLength(1)

  const again = await api.get('/api/offline_snapshot', {
    headers: { 'If-None-Match': first.headers().etag },
  })
  expect(again.status()).toBe(304)
  expect((await again.body()).length).toBe(0)

  console.log(
    `offline snapshot (testdatabase, ${snapshot.recipes.length} recepten): ` +
      `${body.length} bytes, gzip ${gzipSync(body).length} bytes`,
  )
})

test('offline: recept schalen, Alles op lijst, standaardlijst en los item; online naar de database', async ({
  browser,
}) => {
  // Vooraf op de server: thee staat al op de lijst (van de standaardlijst), ei is in huis.
  const thee = await standardItem(`${PREFIX}thee`)
  await api.post('/api/standard_items/add_to_shopping_list', { data: { ids: [thee.id] } })
  await setInHouse(api, 'ei', true)

  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await openOnline(page)

  // ---- Geen verbinding, en herladen: alles komt uit de opslag.
  await context.setOffline(true)
  await page.goto(`/recepten/${recipe.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(RECIPE.title)
  await expect(page.locator('.offline-notice .offline-detail')).toHaveText(
    /^kopie van (vandaag|gisteren) \d\d:\d\d$/,
  )

  // Porties schalen werkt in de browser: 8 porties is alles × 2.
  await page.getByRole('button', { name: 'Meer porties' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(page.locator('.servings-count')).toHaveText('8 porties')
  await expect(ingredientRow(page, 'bloem').locator('.line')).toContainText('500 g bloem')

  // Bewerken, verwijderen, variaties en het huisje staan uit, met een korte melding.
  await expect(page.locator('.recipe-actions .edit')).toBeDisabled()
  await expect(page.locator('.recipe-actions .delete')).toBeDisabled()
  await expect(page.locator('.add-variation')).toBeDisabled()
  await expect(page.locator('.variation-card .edit')).toBeDisabled()
  await expect(page.locator('.variation-card .add-to-list')).toBeEnabled()
  await expect(page.locator('.house-button').first()).toBeDisabled()
  await expect(page.locator('.recipe-actions .offline-hint')).toHaveText(
    'Niet beschikbaar zonder verbinding',
  )

  // "Alles op lijst" kan wel: in de outbox. Ei is (nog) in huis, het voorbeeld slaat het over.
  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await expect(ingredientRow(page, 'bloem').locator('.list-button')).toHaveText('✓ op lijst')
  await expect(ingredientRow(page, 'ei').locator('.list-button')).toHaveText('+ lijst')
  await checkLayout(page, errors, 'offline-recept', { scrollTop: true })

  // ---- Standaardlijst: een item toevoegen en bewerken, en thee met ✓ van de lijst halen.
  await page.locator('.main-nav').getByText('Standaard').click()
  await page.getByRole('button', { name: 'Item toevoegen' }).click()
  const addForm = page.locator('.add-card')
  await addForm.getByLabel('Naam').fill(`${PREFIX}brood`)
  await addForm.getByRole('button', { name: 'Toevoegen' }).click()
  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page.locator('.pending-mark')).toHaveCount(1)
  await page.getByRole('button', { name: `${PREFIX}brood bewerken` }).click()
  const editForm = page.locator('.standard-form')
  await editForm.getByLabel('Naam').fill(`${PREFIX}volkorenbrood`)
  await editForm.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByText(`${PREFIX}volkorenbrood`)).toBeVisible()
  await page
    .getByRole('button', {
      name: `${PREFIX}thee staat op je boodschappenlijst; tik om weg te halen`,
    })
    .click()

  // ---- Boodschappenlijst: los item, twee keer, en "wacht op sync".
  await page.locator('.main-nav').getByText('Boodschappen').click()
  const add = page.getByRole('textbox', { name: 'Iets toevoegen aan de boodschappenlijst' })
  await add.fill(`2 ${PREFIX}appels`)
  await add.press('Enter')
  await expect(add).toBeFocused()
  await add.fill(`${PREFIX}appels 2`)
  await add.press('Enter')
  await expect(shoppingRow(page, `${PREFIX}appels`)).toHaveCount(1)
  await expect(shoppingRow(page, `${PREFIX}appels`).locator('.stepper .value')).toHaveText('4')
  await expect(shoppingRow(page, '500 g bloem').locator('.pending-mark')).toHaveText(
    'wacht op sync',
  )
  await expect(shoppingRow(page, `${PREFIX}thee`)).toHaveCount(0)
  // Recept (1), standaarditem (1, de bewerking zit erin), thee weg (1), appels (1).
  await expect(pendingText(page)).toHaveText('4 wijzigingen wachten op verbinding')
  await expect(page.locator('.clear-all')).toBeDisabled()
  await checkLayout(page, errors, 'offline-boodschappen-wacht-op-sync')

  const estimate = await page.evaluate(async () => {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota, persisted: await navigator.storage.persisted() }
  })
  console.log(`navigator.storage.estimate() na opslaan: ${JSON.stringify(estimate)}`)
  expect(estimate.usage).toBeGreaterThan(0)

  // Nog niets op de server.
  expect((await shoppingList(api)).map((item) => [item.name, item.count])).toEqual([
    [`${PREFIX}thee`, 1],
  ])

  // Intussen, op een ander apparaat: ei is op. De sync gebruikt de stand van de server.
  await setInHouse(api, 'ei', false)

  // ---- Weer online: alles in volgorde naar de server.
  await context.setOffline(false)
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await expect(page.locator('.pending-mark')).toHaveCount(0)

  const lines = (await shoppingList(api)).map((item) => [item.name, item.quantity, item.count])
  expect(lines.toSorted((a, b) => a[0].localeCompare(b[0]))).toEqual([
    ['bloem', 500, 1],
    ['ei', 4, 1],
    ['melk', 1000, 1],
    [`${PREFIX}appels`, null, 4],
  ])
  // Het losse item ("appels") staat na de sync ook op de standaardlijst, onder Tijdelijk
  // (de server, StandardItem.note_used!); de andere twee zijn gewone standaarditems.
  const standard = (await (await api.get('/api/standard_items')).json()).filter((item) =>
    item.name.startsWith(PREFIX),
  )
  expect(
    standard
      .map((item) => [item.name, item.temporary_last_used_at != null])
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toEqual([
    [`${PREFIX}appels`, true],
    [`${PREFIX}thee`, false],
    [`${PREFIX}volkorenbrood`, false],
  ])

  // Nog een keer openen en verversen: niets dubbel.
  await page.reload()
  await expect(shoppingRow(page, `${PREFIX}appels`)).toHaveCount(1)
  expect(await shoppingList(api)).toHaveLength(4)
  await checkLayout(page, errors, 'offline-boodschappen-na-sync')
  await context.close()
})

test('los item: een suggestie koppelt aan het ingrediënt, vrije tekst niet; offline zonder dubbelen', async ({
  browser,
}) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await openOnline(page)
  await page.goto('/boodschappen')
  const add = page.getByRole('textbox', { name: 'Iets toevoegen aan de boodschappenlijst' })

  // Online: "melk" kiezen als suggestie, en vrije tekst.
  await add.fill('mel')
  await page.locator('.suggestion', { hasText: /^\s*\+ melk\s*$/ }).click()
  await expect(shoppingRow(page, /^melk$/)).toHaveCount(1)
  await add.fill(`${PREFIX}wasmiddel`)
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await expect(shoppingRow(page, `${PREFIX}wasmiddel`)).toHaveCount(1)

  // Offline: nog een melk (telt op), en nieuwe vrije tekst.
  await context.setOffline(true)
  await add.fill('melk')
  await add.press('Enter')
  await add.fill(`${PREFIX}zeep`)
  await add.press('Enter')
  await expect(pendingText(page)).toHaveText('2 wijzigingen wachten op verbinding')
  await expect(shoppingRow(page, /^melk$/).locator('.stepper .value')).toHaveText('2')

  await context.setOffline(false)
  await expect(page.locator('.pending-mark')).toHaveCount(0)
  const items = await shoppingList(api)
  const melk = await (await api.get('/api/ingredients')).json()
  expect(
    items.map((item) => [item.name, item.count, item.ingredient_id, item.source_label]).sort(),
  ).toEqual(
    [
      ['melk', 2, melk.find((i) => i.name === 'melk').id, 'los'],
      [`${PREFIX}wasmiddel`, 1, null, 'los'],
      [`${PREFIX}zeep`, 1, null, 'los'],
    ].sort(),
  )
  await checkLayout(page, errors)
  await context.close()
})
