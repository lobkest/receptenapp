import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, iphone, shoppingRow } from './helpers.js'

// "Tijdelijk" op de standaardlijst: een los item op de boodschappenlijst ("Iets toevoegen…")
// komt daar vanzelf (de server doet het, StandardItem.note_used!), als laatste sectie.
// Verplaatsen naar een categorie maakt het permanent. Op een iPhone-scherm; screenshots in
// e2e/screenshots/standaard-tijdelijk*.png.

const NAME = 'verse dille'
const KEPT = 'e2e-zuivel-melk'
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
  await removeStandard(NAME)
  // Een permanent item, zodat er een gewone sectie boven Tijdelijk staat.
  if (!(await standardItems()).some((i) => i.name === KEPT)) {
    const created = await api.post('/api/standard_items', {
      data: { standard_item: { name: KEPT, category: 'zuivel' } },
    })
    expect(created.status(), await created.text()).toBe(201)
  }
})

test.afterAll(async () => {
  await api.delete('/api/shopping_list_items/clear_all')
  await removeStandard(NAME)
  await removeStandard(KEPT)
  await api.dispose()
})

test('een los item komt onder Tijdelijk, als laatste sectie; een categorie maakt het permanent', async ({
  browser,
}) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page)

  await page.goto('/boodschappen')
  const add = page.getByRole('textbox', { name: 'Iets toevoegen aan de boodschappenlijst' })
  await add.fill('Verse Dille')
  await add.press('Enter')
  await expect(shoppingRow(page, NAME)).toBeVisible()

  await page.locator('.main-nav').getByRole('link', { name: 'Standaard' }).click()
  const groups = page.locator('section.group')
  await expect(groups.last()).toHaveClass(/group-temporary/)
  await expect(groups.last().locator('h2')).toHaveText(/tijdelijk/i)
  await expect(groups.last().locator('.row .line')).toHaveText([NAME])
  // Maar één Tijdelijk-sectie, en de gewone secties erboven.
  await expect(page.locator('section.group-temporary')).toHaveCount(1)
  expect(await groups.count()).toBeGreaterThan(1)
  await checkLayout(page, errors, 'standaard-tijdelijk', { scrollTop: false })

  // Bewerken: de keuzelijst begint op "Tijdelijk".
  await page.getByRole('button', { name: `${NAME} bewerken` }).click()
  const category = groups.last().locator('select.category')
  await expect(category.locator('option:checked')).toHaveText('Tijdelijk')
  await checkLayout(page, errors, 'standaard-tijdelijk-bewerken', { scrollTop: false })

  await category.selectOption('zuivel')
  await groups.last().getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.locator('section.group-temporary')).toHaveCount(0)
  const zuivel = page.locator('section.group', { has: page.locator('h2', { hasText: 'zuivel' }) })
  await expect(zuivel.locator('.row .line', { hasText: NAME })).toBeVisible()

  const saved = (await standardItems()).find((i) => i.name === NAME)
  expect(saved.category).toBe('zuivel')
  expect(saved.temporary_last_used_at).toBeNull()
  await context.close()
})
