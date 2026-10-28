import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// "Delen" op de receptpagina op een iPhone-scherm: het recept als tekst, zonder link naar
// de app. Eén keer met deelmenu (nagebootst: de testbrowser heeft er geen), één keer
// zonder, dan naar het klembord. Screenshot in e2e/screenshots/.

let api
let recipeId

const PANCAKES = {
  title: 'Pannenkoeken delen',
  description: 'Voor op zondag.',
  servings: 2,
  steps_attributes: [{ body: 'Beslag maken.' }, { body: 'Bakken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
    {
      ingredient_name: 'melk',
      quantity: 500,
      unit: 'ml',
      alternatives_attributes: [{ ingredient_name: 'havermelk' }],
    },
    { ingredient_name: 'stroop', optional: true },
  ],
  variations_attributes: [{ name: 'Met spek', notes: 'Spek eerst in de pan.' }],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const created = await api.post('/api/recipes', { data: { recipe: PANCAKES } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
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

// Met 3 porties en havermelk gewisseld: dat moet in de tekst staan.
async function openAndPrepare(page) {
  await page.goto(`/recepten/${recipeId}`)
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await page.getByRole('button', { name: 'Wissel voor havermelk' }).click()
  await expect(page).toHaveURL(/wissel=/)
}

const EXPECTED = [
  'Pannenkoeken delen',
  '3 porties',
  '',
  'Voor op zondag.',
  '',
  'Ingrediënten',
  '- 375 g bloem',
  '- 750 ml havermelk (of: 750 ml melk)',
  '- stroop (optioneel)',
  '',
  'Bereiding',
  '1. Beslag maken.',
  '2. Bakken.',
  '',
  'Variaties',
  'Met spek',
  'Spek eerst in de pan.',
].join('\n')

test('delen via het deelmenu van de telefoon', async ({ page }) => {
  const errors = collectErrors(page)
  // Het deelmenu nabootsen: onthoud wat er gedeeld wordt.
  await page.addInitScript(() => {
    navigator.share = async (data) => {
      window.__shared = data
    }
  })
  await openAndPrepare(page)

  await page.getByRole('button', { name: 'Delen' }).click()

  await expect
    .poll(() => page.evaluate(() => window.__shared))
    .toEqual({
      title: 'Pannenkoeken delen',
      text: EXPECTED,
    })
  await expect(page.locator('.share-message')).toHaveCount(0)
  expect(errors, 'geen console-errors').toEqual([])
})

test('zonder deelmenu: naar het klembord, met melding', async ({ page, context }) => {
  const errors = collectErrors(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    delete Navigator.prototype.share
  })
  await openAndPrepare(page)

  const button = page.getByRole('button', { name: 'Delen' })
  await button.click()

  await expect(page.locator('.share-message')).toHaveText(
    'Recept gekopieerd. Plak het waar je wilt.',
  )
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EXPECTED)
  // Knoppen minstens 40 px hoog, zoals elders in de app (compact.spec.js).
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(40)

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  await page.locator('.recipe-actions').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/screenshots/share-copied.png', animations: 'disabled' })
  expect(errors, 'geen console-errors').toEqual([])
})
