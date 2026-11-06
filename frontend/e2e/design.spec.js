import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe, giveTraits } from './traits.js'
import { cardTagNames, checkLayout, collectErrors, postRecipe } from './helpers.js'

// De vormgeving op een iPhone-scherm: zachte kaarten, gevulde velden, pilknoppen en
// tag-iconen. Screenshots in e2e/screenshots/stijl-*.png; checkLayout bewaakt dat niets
// buiten het scherm loopt en dat er geen console-errors zijn.

let api
const recipeIds = []
const standardIds = []

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  await giveTraits(api, 'kip', ['vlees', 'dierlijk'])
  await giveTraits(api, 'rijst', [])
  await giveTraits(api, 'tomaat', [])
  // Wok: vijf automatische tags (twee met een wissel: kip of tofu) en een vrije tag.
  // Salade: automatische tags, snel (icoon) en een vrije tag: zeven, dus ook "+1".
  const wok = await postRecipe(api, {
    title: 'Stijl-wok met rijst',
    servings: 2,
    tag_names: ['zomeravond'],
    steps_attributes: [{ body: 'Bakken en mengen.' }],
    recipe_ingredients_attributes: [
      {
        ingredient_name: 'kip',
        quantity: 250,
        unit: 'g',
        alternatives_attributes: [{ ingredient_name: 'tofu' }],
      },
      { ingredient_name: 'rijst', quantity: 150, unit: 'g' },
    ],
  })
  const salad = await postRecipe(api, {
    title: 'Stijl-tomatensalade',
    servings: 4,
    tag_names: ['snel', 'bijgerecht'],
    steps_attributes: [{ body: 'Snijden.' }],
    recipe_ingredients_attributes: [{ ingredient_name: 'tomaat', quantity: 3, unit: 'stuks' }],
  })
  recipeIds.push(wok.id, salad.id)

  for (const item of [
    { name: 'stijl-havermout', category: 'houdbaar' },
    { name: 'stijl-appels', category: 'groente' },
  ]) {
    const created = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(created.status(), await created.text()).toBe(201)
    standardIds.push((await created.json()).id)
  }
})

test.afterAll(async () => {
  for (const id of recipeIds) await deleteRecipe(api, id)
  if (standardIds.length) {
    await api.post('/api/standard_items/bulk_destroy', { data: { ids: standardIds } })
  }
  await api.delete('/api/shopping_list_items/clear_all')
  await api.dispose()
})

test('recept toevoegen: leeg en ingevuld', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await expect(page.getByLabel('Titel')).toHaveAttribute('placeholder', 'Naam van je recept')
  await checkLayout(page, errors, 'stijl-recept-toevoegen-leeg')

  await page.getByLabel('Titel').fill('Pasta met tomaat')
  await page.locator('.ingredients .add').click()
  await page.locator('.ingredients .add').click()
  for (const [i, [name, quantity]] of [
    ['spaghetti', '300'],
    ['tomaat', '4'],
    ['knoflook', '2'],
  ].entries()) {
    await page.getByLabel(`Naam ingrediënt ${i + 1}`).fill(name)
    await page.getByLabel(`Hoeveelheid ingrediënt ${i + 1}`).fill(quantity)
  }
  await page.getByLabel('Stap 1', { exact: true }).fill('Kook de pasta in ruim water met zout.')
  await page.locator('.steps .add').click()
  await page.getByLabel('Stap 2', { exact: true }).fill('Bak tomaat en knoflook, meng alles.')
  await page.getByRole('button', { name: 'Eén portie meer' }).click()

  await expect(page.locator('.ingredients .section-meta')).toHaveText('3 ingrediënten')
  await expect(page.locator('.steps .section-meta')).toHaveText('2 stappen')
  await expect(page.locator('#servings')).toHaveValue('5')
  // Het stapnummer staat naast het tekstveld, niet erboven.
  const number = await page.locator('.step-number').first().boundingBox()
  const field = await page.getByLabel('Stap 1', { exact: true }).boundingBox()
  expect(number.x + number.width).toBeLessThanOrEqual(field.x)
  await checkLayout(page, errors, 'stijl-recept-toevoegen-ingevuld', { scrollTop: true })
})

test('receptenoverzicht: iconen, wissel-stipje en vrije tag', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const wok = page.locator('.recipe-card', { hasText: 'Stijl-wok met rijst' })
  // De automatische tags (volgorde van de server) als icoon, de vrije tag achteraan.
  await expect.poll(() => cardTagNames(wok)).toContain('vegetarisch, met wissel')
  expect((await cardTagNames(wok)).at(-1)).toBe('zomeravond')
  await expect(wok.locator('.tag-text')).toHaveText(['zomeravond'])
  const salad = page.locator('.recipe-card', { hasText: 'Stijl-tomatensalade' })
  await expect(salad.getByRole('img', { name: 'snel' })).toBeVisible()
  await expect(salad.locator('.tag-more')).toHaveText('+1')
  // Elk icoon is echt getekend (een svg met paden), niet leeg.
  for (const icon of await wok.locator('.bubble svg').all()) {
    expect(await icon.locator('path').count()).toBeGreaterThan(0)
  }
  await expect(wok.locator('.tag-hint .bubble')).not.toHaveCount(0)
  // De filterchips tonen icoon + naam.
  await expect(
    page.locator('.tag-chips .filter-chip', { hasText: 'vegetarisch' }).locator('svg'),
  ).toBeVisible()
  await checkLayout(page, errors, 'stijl-receptenoverzicht', { fullPage: false })
})

test('boodschappen en standaard', async ({ page }) => {
  const errors = collectErrors(page)
  const added = await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'stijl-melk' }, { name: 'stijl-brood' }] },
  })
  expect(added.status(), await added.text()).toBe(201)

  await page.goto('/boodschappen')
  await expect(page.getByText('stijl-melk')).toBeVisible()
  await page.getByRole('checkbox', { name: /stijl-brood/ }).check()
  await checkLayout(page, errors, 'stijl-boodschappen')

  await page.goto('/standaard')
  await expect(page.getByText('stijl-havermout')).toBeVisible()
  // Bij het starten geldt de app even als offline (tot de eerste /up): wacht daarop.
  await expect(page.locator('.offline-title')).toHaveCount(0)
  await checkLayout(page, errors, 'stijl-standaard')
})
