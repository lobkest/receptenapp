import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL } from './env.js'

// Controleert per hoofdpagina op een iPhone-scherm: geen console-errors, niets
// breder dan het scherm, en een screenshot in e2e/screenshots/ om zelf te bekijken.

// 74 tekens zonder spatie: moet afbreken in plaats van de pagina breder te maken.
const LONG_TITLE = 'Standaardboodschappenovenschotelmetextralangetitelzonderspatiesdienietpast'
const TITLES = [LONG_TITLE, 'Pannenkoeken', 'Erwtensoep met roggebrood']

const ADMIN_HEADERS = { Authorization: `Bearer ${ADMIN_TOKEN}` }

let api
const recipeIds = []

function recipeData(title) {
  return {
    recipe: {
      title,
      description: 'Testrecept van de e2e-tests.',
      servings: 4,
      steps_attributes: [{ body: 'Alles mengen en bakken.' }],
      recipe_ingredients_attributes: [
        { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
        { ingredient_name: 'melk', quantity: 500, unit: 'ml' },
        { ingredient_name: 'zout', quantity: null, unit: null },
      ],
    },
  }
}

// Testdata via de echte API: insturen (publiek) en goedkeuren (beheer).
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  for (const title of TITLES) {
    const created = await api.post('/api/recipes', { data: recipeData(title) })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()
    recipeIds.push(id)

    const approved = await api.patch(`/api/admin/recipes/${id}/approve`, { headers: ADMIN_HEADERS })
    expect(approved.ok(), await approved.text()).toBe(true)
  }
})

// De database zelf wordt leeggemaakt in e2e/global-teardown.js.
test.afterAll(async () => {
  await api.dispose()
})

// Verzamelt console-errors en onafgevangen fouten van de pagina.
function collectErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function checkLayout(page, errors, name) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)

  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })
  expect(errors, 'geen console-errors').toEqual([])
}

test('recepten: grid met twee kolommen', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()

  const columns = await page
    .locator('.recipe-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)

  await checkLayout(page, errors, 'recepten')
})

test('recept insturen', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await expect(page.getByRole('heading', { name: 'Recept insturen' })).toBeVisible()

  await checkLayout(page, errors, 'recept-insturen')
})

test('receptdetail met lange titel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeIds[0]}`)
  await expect(page.getByRole('heading', { level: 1, name: LONG_TITLE })).toBeVisible()

  await checkLayout(page, errors, 'recept-detail')
})

test('boodschappen: afvinken met een groene checkbox', async ({ page }) => {
  const errors = collectErrors(page)
  // De lijst staat in localStorage: eerst vullen vanaf een recept.
  await page.goto(`/recepten/${recipeIds[1]}`)
  await page.locator('.add-all').click()
  await page.goto('/boodschappen')

  const checkboxes = page.locator('.items input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(3)
  await checkboxes.first().check()

  // Thema-groen (--color-brand), niet de zwarte standaard van de browser.
  const accent = await checkboxes.first().evaluate((box) => getComputedStyle(box).accentColor)
  expect(accent).toBe('rgb(46, 125, 67)')
  await expect(page.getByRole('button', { name: 'Afgevinkte wissen' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Alles wissen' })).toBeVisible()
  await expect(page.getByText('Ik ga winkelen')).toHaveCount(0)

  await checkLayout(page, errors, 'boodschappen')
})

test('standaardboodschappen met voorbeeldlijst', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/standaard')
  await expect(page.getByRole('heading', { name: 'Standaardboodschappen' })).toBeVisible()
  await page.getByRole('button', { name: 'Voorbeeldlijst laden' }).click()

  await checkLayout(page, errors, 'standaard')
})

test('licht thema, ook als de telefoon op donker staat', async ({ page }) => {
  await page.goto('/')
  const { scheme, background } = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
  }))
  expect(scheme).toBe('light')
  expect(background).toBe('rgb(250, 248, 244)')
})
