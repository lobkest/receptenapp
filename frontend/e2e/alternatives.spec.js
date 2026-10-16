import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Ingrediënt wisselen op een iPhone-scherm: chips onder een ingrediënt, de wissel in de
// URL (ook na herladen), "Alles op lijst" met het alternatief, en een alternatief
// toevoegen via het bewerkformulier. Screenshots in e2e/screenshots/.

let api
let recipeId

const WOK = {
  title: 'Wok met kip',
  servings: 2,
  steps_attributes: [{ body: 'Kip bakken, groente erbij, rijst ernaast.' }],
  recipe_ingredients_attributes: [
    {
      ingredient_name: 'kipfilet',
      quantity: 250,
      unit: 'g',
      alternatives_attributes: [
        { ingredient_name: 'tofu' },
        { ingredient_name: 'tempeh', quantity: 200, unit: 'g' },
        { ingredient_name: 'kikkererwten uit blik', quantity: 1, unit: 'stuks' },
      ],
    },
    { ingredient_name: 'zilvervliesrijst', quantity: 150, unit: 'g' },
    { ingredient_name: 'paprika', quantity: 1, unit: 'stuks' },
    {
      ingredient_name: 'koriander',
      quantity: 5,
      unit: 'g',
      optional: true,
      alternatives_attributes: [{ ingredient_name: 'peterselie' }],
    },
  ],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const created = await api.post('/api/recipes', { data: { recipe: WOK } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
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

// Niets breder dan het scherm, geen console-errors; met een naam ook een screenshot.
async function checkLayout(page, errors, name = null) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  if (name) {
    await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: 'disabled' })
  }
  expect(errors, 'geen console-errors').toEqual([])
}

// Net als elders in de app (compact.spec.js): elke knop minstens 40 px hoog.
async function checkTapTargets(page, selector) {
  const heights = await page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(heights.length).toBeGreaterThan(0)
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(40)
}

function lines(page) {
  return page.locator('section.ingredients .line')
}

test('wisselen, URL, herladen en Alles op lijst', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto(`/recepten/${recipeId}`)
  await expect(lines(page).first()).toHaveText('250 g kipfilet')
  await expect(page.locator('section.ingredients .chip')).toHaveText([
    '⇄ tofu',
    '⇄ tempeh',
    '⇄ kikkererwten uit blik',
    '⇄ peterselie',
  ])
  await checkTapTargets(page, 'section.ingredients button')
  await checkLayout(page, errors, 'recept-alternatieven')

  // ---- Wisselen: tempeh met zijn eigen hoeveelheid, en koriander → peterselie.
  await page.getByRole('button', { name: 'Wissel voor tempeh' }).click()
  await page.getByRole('button', { name: 'Wissel voor peterselie' }).click()
  await expect(lines(page).first()).toHaveText('200 g tempeh')
  await expect(lines(page).last()).toHaveText('5 g peterselie (optioneel)')
  await expect(page.getByRole('button', { name: 'Terug naar kipfilet' })).toHaveText('↺ kipfilet')
  await expect(page).toHaveURL(/[?&]wissel=\d+:\d+%2C\d+:\d+|[?&]wissel=\d+:\d+,\d+:\d+/)
  await checkLayout(page, errors, 'recept-gewisseld')

  // ---- Herladen: de wissel blijft, en schaalt mee met de porties.
  await page.reload()
  await expect(lines(page).first()).toHaveText('200 g tempeh')
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(lines(page).first()).toHaveText('300 g tempeh')

  // ---- Alles op lijst: tempeh in plaats van kip; peterselie blijft optioneel en gaat niet mee.
  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await expect(page.locator('section.ingredients [role="status"]')).toContainText('behalve de optionele')
  const items = await (await api.get('/api/shopping_list_items')).json()
  expect(items.map((item) => [item.name, item.quantity, item.unit]).sort()).toEqual([
    ['paprika', 1.5, 'stuks'],
    ['tempeh', 300, 'g'],
    ['zilvervliesrijst', 225, 'g'],
  ])
  expect(new Set(items.map((item) => item.source_label))).toEqual(new Set(['Wok met kip']))

  // ---- Terug naar het origineel: wissel uit de URL voor die regel.
  await page.getByRole('button', { name: 'Terug naar kipfilet' }).click()
  await expect(lines(page).first()).toHaveText('375 g kipfilet')

  // ---- Een verouderde link: geen fout, gewoon het origineel.
  await page.goto(`/recepten/${recipeId}?wissel=999999:1,abc`)
  await expect(lines(page).first()).toHaveText('250 g kipfilet')
  await checkLayout(page, errors)
})

test('alternatief toevoegen via het bewerkformulier', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto(`/recepten/${recipeId}/bewerken`)
  await expect(page.getByRole('heading', { name: 'Recept bewerken' })).toBeVisible()
  // De bestaande alternatieven staan open bij hun regel.
  await expect(page.getByLabel('Alternatief 1 voor ingrediënt 1', { exact: true })).toHaveValue('tofu')

  await page.getByRole('button', { name: 'Alternatief voor ingrediënt 2 toevoegen' }).click()
  await page.getByLabel('Alternatief 1 voor ingrediënt 2', { exact: true }).fill('Basmatirijst')
  await page.getByLabel('Hoeveelheid alternatief 1 voor ingrediënt 2').fill('125')
  await page.getByLabel('Eenheid alternatief 1 voor ingrediënt 2').selectOption('g')
  await page.getByLabel('Alternatief 1 voor ingrediënt 2', { exact: true }).scrollIntoViewIfNeeded()
  await checkTapTargets(page, '.ingredients button')
  await page.getByLabel('Alternatief 1 voor ingrediënt 2', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/screenshots/recept-bewerken-alternatief-scherm.png', animations: 'disabled' })
  await checkLayout(page, errors, 'recept-bewerken-alternatief')

  // Dubbel alternatief: de server meldt het bij de regel.
  await page.getByRole('button', { name: 'Alternatief voor ingrediënt 2 toevoegen' }).click()
  await page.getByLabel('Alternatief 2 voor ingrediënt 2', { exact: true }).fill('basmatirijst')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.locator('.ingredient-row').nth(1).locator('.error')).toHaveText(
    'Alternatief 2: naam staat al als alternatief bij dit ingrediënt',
  )
  await page.getByRole('button', { name: 'Alternatief 2 voor ingrediënt 2 verwijderen' }).click()

  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('status').first()).toHaveText('"Wok met kip" is opgeslagen.')
  await page.getByRole('button', { name: 'Wissel voor basmatirijst' }).click()
  await expect(lines(page).nth(1)).toHaveText('125 g basmatirijst')

  const recipe = await (await api.get(`/api/recipes/${recipeId}`)).json()
  expect(recipe.ingredients[1].alternatives.map((a) => [a.name, a.quantity, a.unit])).toEqual([
    ['basmatirijst', 125, 'g'],
  ])
  // De 422 van het dubbele alternatief logt de browser zelf ("Failed to load resource").
  expect(errors.filter((e) => !e.includes('422'))).toEqual([])
})
