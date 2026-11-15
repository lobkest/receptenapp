import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, openShoppingList, postRecipe, shoppingRow } from './helpers.js'

// "Afgevinkt onderaan" op de boodschappenlijst: aan staan per categorie (of per recept) alleen
// de open regels, en alle afgevinkte samen in "In je mandje (n)" onderaan, standaard
// ingeklapt. Een afgevinkte regel verhuist pas na ~800 ms. De stand van de knop staat per
// apparaat in localStorage. Screenshots in e2e/screenshots/.

let api
let recipe
// De standaarditems die deze test zelf aanmaakte (afterAll ruimt ze op).
const created = []

// Unieke namen, zodat andere specs met dezelfde namen hier niet doorheen lopen.
const STANDARD = [
  { name: 'mandje-melk', category: 'zuivel' },
  { name: 'mandje-yoghurt', category: 'zuivel' },
  { name: 'mandje-appel', category: 'fruit' },
  { name: 'mandje-peer', category: 'fruit' },
  { name: 'mandje-brood', category: 'bakker' },
]

const RECIPE = {
  title: 'Mandje-curry',
  servings: 2,
  steps_attributes: [{ body: 'Alles in de pan.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'mandje-kikkererwten', quantity: 400, unit: 'g' },
    { ingredient_name: 'mandje-kokosmelk', quantity: 400, unit: 'ml' },
  ],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const existing = await (await api.get('/api/standard_items')).json()
  for (const item of STANDARD) {
    if (existing.some((other) => other.name === item.name)) continue
    const response = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(response.status(), await response.text()).toBe(201)
    created.push((await response.json()).id)
  }
  recipe = await postRecipe(api, RECIPE)
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
})

test.afterAll(async () => {
  if (created.length) await api.post('/api/standard_items/bulk_destroy', { data: { ids: created } })
  await api.dispose()
})

// De vijf standaarditems op de lijst (drie categorieën); met withRecipe ook het recept.
async function fillList({ withRecipe = false } = {}) {
  const all = await (await api.get('/api/standard_items')).json()
  const ids = all.filter((item) => item.name.startsWith('mandje-')).map((item) => item.id)
  const added = await api.post('/api/standard_items/add_to_shopping_list', { data: { ids } })
  expect(added.status(), await added.text()).toBe(200)
  if (withRecipe) {
    const response = await api.post(`/api/recipes/${recipe.id}/add_to_shopping_list`)
    expect(response.status(), await response.text()).toBe(201)
  }
}

const chip = (page) => page.locator('.checked-bottom')
const basket = (page) => page.locator('.section.basket')
const basketToggle = (page) => page.locator('.basket-toggle')
const openSections = (page) => page.locator('.section:not(.basket)')
const openLines = (page) => openSections(page).locator('.line')
const basketLines = (page) => basket(page).locator('.line')
const categoryTitles = (page) => page.locator('.category-title')

async function check(page, name) {
  await shoppingRow(page, name).locator('input[type="checkbox"]').click()
}

test('1-4) aan: open regels per categorie, afgevinkte in het mandje; terugzetten; lege categorie weg; blijft na herladen', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await fillList()
  await openShoppingList(page)

  // Standaard uit: alles op zijn plek, geen mandje.
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(basket(page)).toHaveCount(0)
  await chip(page).click()
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true')

  // 1) Twee items afvinken (uit verschillende categorieën). Eerst blijven ze nog staan,
  // daarna gaan ze naar het mandje.
  await check(page, 'mandje-melk')
  await expect(openLines(page).filter({ hasText: 'mandje-melk' })).toHaveCount(1)
  await check(page, 'mandje-appel')
  await expect(basketToggle(page)).toHaveText(/In je mandje \(2\)/)
  await expect(openLines(page).filter({ hasText: 'mandje-melk' })).toHaveCount(0)
  await expect(openLines(page).filter({ hasText: 'mandje-appel' })).toHaveCount(0)
  // Ingeklapt: de regels in het mandje zijn niet te zien.
  await expect(basketToggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(basketLines(page)).toHaveCount(0)
  // Het mandje is de laatste sectie.
  await expect(page.locator('.section').last()).toHaveClass(/basket/)
  await checkLayout(page, errors, 'afgevinkt-onderaan-1-mandje-dicht')

  // 2) Uitklappen en melk weer open zetten: terug in zuivel.
  await basketToggle(page).click()
  await expect(basketToggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(basketLines(page)).toHaveCount(2)
  await checkLayout(page, errors, 'afgevinkt-onderaan-2-mandje-open')
  await basket(page).locator('li').filter({ hasText: 'mandje-melk' }).locator('input').click()
  const zuivel = page
    .locator('.section')
    .filter({ has: page.locator('.category-title', { hasText: 'zuivel' }) })
  await expect(zuivel.locator('.line').filter({ hasText: 'mandje-melk' })).toHaveCount(1)
  await expect(basketToggle(page)).toHaveText(/In je mandje \(1\)/)

  // 3) Ook peer afvinken: fruit heeft geen open regels meer en verdwijnt.
  await check(page, 'mandje-peer')
  await expect(categoryTitles(page).filter({ hasText: 'fruit' })).toHaveCount(0)
  await expect(basketToggle(page)).toHaveText(/In je mandje \(2\)/)
  await checkLayout(page, errors, 'afgevinkt-onderaan-3-categorie-weg')

  // 4) Herladen: de knop staat nog aan, het mandje weer dicht.
  await page.reload()
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(basketToggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(categoryTitles(page).filter({ hasText: 'fruit' })).toHaveCount(0)

  // Uit: weer de gewone weergave, afgevinkte regels in hun eigen categorie.
  await chip(page).click()
  await expect(basket(page)).toHaveCount(0)
  await expect(categoryTitles(page).filter({ hasText: 'fruit' })).toHaveCount(1)
  await page.reload()
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('weer open binnen 800 ms: de regel verhuist niet', async ({ page }) => {
  await fillList()
  await page.addInitScript(() => localStorage.setItem('receptenapp:afgevinktOnderaan', '1'))
  await openShoppingList(page)
  const row = openSections(page).locator('li').filter({ hasText: 'mandje-brood' })
  await row.locator('input').click()
  await row.locator('input').click()
  await page.waitForTimeout(1200)
  await expect(row).toHaveCount(1)
  await expect(basket(page)).toHaveCount(0)
})

test.describe('met animatie', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('het verhuizen schuift de rest op (move-class), zonder verspringen', async ({ page }) => {
    const errors = collectErrors(page)
    await fillList()
    await page.addInitScript(() => localStorage.setItem('receptenapp:afgevinktOnderaan', '1'))
    await openShoppingList(page)
    await check(page, 'mandje-melk')
    // Na de vertraging begint de animatie: de regel eronder krijgt de move-class.
    await page.waitForSelector('.items li.shift-move', { state: 'attached', timeout: 2000 })
    await expect(page.locator('.shift-move, .shift-leave-active')).toHaveCount(0)
    await expect(basketToggle(page)).toHaveText(/In je mandje \(1\)/)
    expect(errors).toEqual([])
  })
})

test('5) met "Groepeer per recept": afgevinkte uit elk recept naar het mandje', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await fillList({ withRecipe: true })
  await page.addInitScript(() => localStorage.setItem('receptenapp:afgevinktOnderaan', '1'))
  await openShoppingList(page, '/boodschappen?groep=recept')

  const curry = page
    .locator('.section')
    .filter({ has: page.locator('.section-title', { hasText: 'Mandje-curry' }) })
  await expect(curry).toHaveCount(1)
  await check(page, 'mandje-kikkererwten')
  await check(page, 'mandje-yoghurt')
  await expect(basketToggle(page)).toHaveText(/In je mandje \(2\)/)
  await expect(curry.locator('.line')).toHaveText([/mandje-kokosmelk/])

  // Laatste regel van het recept: de sectie verdwijnt.
  await check(page, 'mandje-kokosmelk')
  await expect(curry).toHaveCount(0)
  await expect(basketToggle(page)).toHaveText(/In je mandje \(3\)/)
  await basketToggle(page).click()
  await expect(basketLines(page)).toHaveCount(3)
  // In het mandje staat de herkomst er wel bij (de kop is hier geen recept).
  await expect(basket(page).locator('.sources').first()).toBeVisible()
  await checkLayout(page, errors, 'afgevinkt-onderaan-5-per-recept')

  // Terugzetten: weer in de sectie van het recept.
  await basket(page).locator('li').filter({ hasText: 'mandje-kokosmelk' }).locator('input').click()
  await expect(curry.locator('.line')).toHaveText([/mandje-kokosmelk/])
  expect(errors).toEqual([])
})
