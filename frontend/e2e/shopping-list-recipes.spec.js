import { test, expect, devices } from '@playwright/test'
import { PWA_URL, RAILS_URL } from './env.js'
import {
  checkLayout,
  collectErrors,
  openShoppingList,
  postRecipe,
  shoppingList,
  sorted,
  sortedLines,
} from './helpers.js'

// "Recepten op je lijst" onderaan de boodschappenlijst: per recept het aantal open regels,
// "Groepeer per recept" (in de URL: ?groep=recept) en "Verwijder" voor alles van één recept.
// Screenshots in e2e/screenshots/.

let api
let orzo
let wok
let melkId
// De standaarditems die deze test zelf aanmaakte (afterAll ruimt ze op).
const created = []

const ORZO = {
  title: 'Groep-orzo',
  servings: 2,
  steps_attributes: [{ body: 'Orzo koken, groente erdoor.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'orzo', quantity: 250, unit: 'g' },
    { ingredient_name: 'feta', quantity: 100, unit: 'g' },
    { ingredient_name: 'melk', quantity: 200, unit: 'ml' },
    { ingredient_name: 'courgette', quantity: 300, unit: 'g' },
  ],
}

const WOK = {
  title: 'Groep-wok',
  servings: 2,
  steps_attributes: [{ body: 'Alles roerbakken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'kip', quantity: 300, unit: 'g' },
    { ingredient_name: 'rijst', quantity: 200, unit: 'g' },
  ],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  orzo = await postRecipe(api, ORZO)
  wok = await postRecipe(api, WOK)

  // melk op de standaardlijst; bestaat hij al (uit een andere test), dan die.
  const existing = await (await api.get('/api/standard_items')).json()
  const melk = existing.find((item) => item.name === 'melk')
  if (melk) {
    melkId = melk.id
  } else {
    const response = await api.post('/api/standard_items', {
      data: { standard_item: { name: 'melk', category: 'zuivel' } },
    })
    expect(response.status(), await response.text()).toBe(201)
    melkId = (await response.json()).id
    created.push(melkId)
  }
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
})

test.afterAll(async () => {
  if (created.length) await api.post('/api/standard_items/bulk_destroy', { data: { ids: created } })
  await api.dispose()
})

// Beide recepten helemaal op de lijst (eerst orzo, dan wok), feta afgevinkt. Met
// standardMelk ook melk van de standaardlijst: "200 ml melk +1" bij de orzo.
async function fillList({ standardMelk = false } = {}) {
  for (const recipe of [orzo, wok]) {
    const response = await api.post(`/api/recipes/${recipe.id}/add_to_shopping_list`)
    expect(response.status(), await response.text()).toBe(201)
  }
  const feta = (await shoppingList(api)).find((item) => item.name === 'feta')
  const patched = await api.patch(`/api/shopping_list_items/${feta.id}`, {
    data: { shopping_list_item: { checked: true } },
  })
  expect(patched.status()).toBe(200)
  if (standardMelk) {
    const added = await api.post('/api/standard_items/add_to_shopping_list', {
      data: { ids: [melkId] },
    })
    expect(added.status(), await added.text()).toBe(200)
  }
}

function boxRows(page) {
  return page.locator('.list-recipes li')
}

function boxRow(page, title) {
  return boxRows(page).filter({ has: page.locator('.name', { hasText: title }) })
}

function sectionTitles(page) {
  return page.locator('.section-title')
}

function sectionLines(page, title) {
  return page
    .locator('.section')
    .filter({ has: page.locator('.section-title', { hasText: title }) })
    .locator('.line')
}

test('a+b+c) het vakje toont beide recepten; groeperen staat in de URL en blijft na herladen', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await fillList()
  await openShoppingList(page)

  // a) Wok is het laatst toegevoegd, dus bovenaan. Afgevinkte feta telt niet mee.
  await expect(boxRows(page).locator('.name')).toHaveText(['Groep-wok', 'Groep-orzo'])
  await expect(boxRows(page).locator('.count')).toHaveText(['2 items', '3 items'])
  await expect(boxRow(page, 'Groep-orzo').locator('a')).toHaveAttribute(
    'href',
    `/recepten/${orzo.id}`,
  )
  await expect(page.locator('.section-title')).toHaveCount(0)
  await expect(page.locator('.ungroup')).toHaveCount(0)
  await checkLayout(page, errors, 'boodschappen-recepten')

  // b) Groeperen aan: secties per recept, losse regels (hier geen) achteraan.
  await page.getByLabel('Groepeer per recept').check()
  await expect(page).toHaveURL(/\?groep=recept$/)
  await expect(sectionTitles(page)).toHaveText(['Groep-wok', 'Groep-orzo'])
  await expect(sectionLines(page, 'Groep-orzo')).toHaveText([
    '250 g orzo',
    '100 g feta',
    '200 ml melk',
    '300 g courgette',
  ])
  await expect(sectionLines(page, 'Groep-wok')).toHaveText(['300 g kip', '200 g rijst'])

  await page.reload()
  await expect(sectionTitles(page)).toHaveText(['Groep-wok', 'Groep-orzo'])
  await expect(page.getByLabel('Groepeer per recept')).toBeChecked()
  await checkLayout(page, errors, 'boodschappen-gegroepeerd')

  // c) "Groepering uit" bovenaan: weer de gewone lijst.
  await page.locator('.ungroup').click()
  await expect(page).toHaveURL(/\/boodschappen$/)
  await expect(sectionTitles(page)).toHaveCount(0)
  await expect
    .poll(() => sortedLines(page))
    .toEqual(
      sorted([
        '250 g orzo',
        '100 g feta',
        '200 ml melk',
        '300 g courgette',
        '300 g kip',
        '200 g rijst',
      ]),
    )
  await expect(page.locator('.items li', { hasText: '100 g feta' })).toHaveClass(/checked/)
})

test('d+f) verwijder recept A: alleen de open regels weg; daarna op het recept weer "+ lijst"', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await fillList()
  await openShoppingList(page)

  await boxRow(page, 'Groep-orzo')
    .getByRole('button', { name: 'Alles van Groep-orzo verwijderen' })
    .click()
  const dialog = page.locator('dialog')
  await expect(dialog.locator('h2')).toHaveText("3 items van 'Groep-orzo' van de lijst halen?")
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()

  await expect(page.locator('.items .line')).toHaveText(['100 g feta', '300 g kip', '200 g rijst'])
  await expect(boxRows(page).locator('.name')).toHaveText(['Groep-wok'])
  const list = await shoppingList(api)
  expect(list.map((item) => [item.name, item.checked])).toEqual([
    ['feta', true],
    ['kip', false],
    ['rijst', false],
  ])

  // f) Op de receptpagina staat niets meer open op de lijst: overal "+ lijst".
  await page.goto(`/recepten/${orzo.id}`)
  const buttons = page.locator('.ingredients > ul > li .list-button')
  await expect(buttons).toHaveText(['+ lijst', '+ lijst', '+ lijst', '+ lijst'])
  expect(errors).toEqual([])
})

test('e) "200 ml melk +1" blijft als "melk"; de dialoog zegt dat', async ({ page }) => {
  const errors = collectErrors(page)
  await fillList({ standardMelk: true })
  await openShoppingList(page)
  await expect(page.locator('.items .line', { hasText: /^200 ml melk \+1$/ })).toHaveCount(1)

  await boxRow(page, 'Groep-orzo').locator('.remove-recipe').click()
  const dialog = page.locator('dialog')
  await expect(dialog.locator('h2')).toHaveText("2 items van 'Groep-orzo' van de lijst halen?")
  await expect(dialog).toContainText(
    '1 item blijft staan omdat het ook via de standaardlijst is toegevoegd.',
  )
  await checkLayout(page, errors, 'boodschappen-recept-verwijderen')
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()

  await expect
    .poll(() => sortedLines(page))
    .toEqual(sorted(['100 g feta', 'melk', '300 g kip', '200 g rijst']))
  const melk = (await shoppingList(api)).find((item) => item.name === 'melk')
  expect(melk).toMatchObject({
    recipe_id: null,
    quantity: null,
    source_label: 'standaard',
    standard_count: 1,
  })

  // De receptpagina: melk staat er nog, maar via de standaardlijst.
  await page.goto(`/recepten/${orzo.id}`)
  await expect(page.locator('.ingredients > ul > li .list-button')).toHaveText([
    '+ lijst',
    '+ lijst',
    '+ lijst',
  ])
  await expect(page.locator('.ingredients > ul > li .via-source')).toHaveText('via standaard')
})

test('g) offline: groeperen werkt op de opgeslagen lijst, verwijderen niet', async ({
  browser,
}) => {
  await fillList({ standardMelk: true })
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    baseURL: PWA_URL,
  })
  const page = await context.newPage()
  const errors = collectErrors(page)

  await openShoppingList(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(boxRows(page)).toHaveCount(2)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.offline-notice')).toContainText(
    /^Offline kopie van \d{1,2} [a-z]{3}( \d{4})? om \d\d:\d\d, Offline/,
  )

  await page.getByLabel('Groepeer per recept').check()
  await expect(page).toHaveURL(/\?groep=recept$/)
  await expect(sectionTitles(page)).toHaveText(['Groep-wok', 'Groep-orzo'])
  // De +1-regel staat bij het recept, niet bij "Los / standaardlijst".
  await expect(sectionLines(page, 'Groep-orzo')).toContainText(['200 ml melk +1'])
  for (const button of await page.locator('.remove-recipe').all()) {
    await expect(button).toBeDisabled()
  }
  await expect(page.locator('.list-recipes')).toContainText('Verwijderen kan alleen online.')
  await checkLayout(page, errors, 'boodschappen-recepten-offline')

  await context.close()
})
