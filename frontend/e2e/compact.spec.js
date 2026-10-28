import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { collectErrors } from './helpers.js'

// Compacte layout zonder kopbalk, op een iPhone 13/14 (390×844) mét notch: Chromium
// krijgt dezelfde veilige zones als de echte telefoon (47 px statusbalk, 34 px
// thuisbalk). Screenshots staan in e2e/screenshots/compact-*.png.

const NOTCH = { top: 47, bottom: 34, left: 0, right: 0 }

test.use({ viewport: { width: 390, height: 844 } })

let api
let recipeId
const standardIds = []

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const created = await api.post('/api/recipes', {
    data: {
      recipe: {
        title: 'Compacte pannenkoeken',
        description: 'Dun en goudbruin, met stroop of suiker.',
        servings: 4,
        tag_names: ['ontbijt', 'snel'],
        steps_attributes: [{ body: 'Alles mengen.' }, { body: 'Dun uitbakken in boter.' }],
        recipe_ingredients_attributes: [
          { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
          { ingredient_name: 'melk', quantity: 500, unit: 'ml' },
          { ingredient_name: 'zout', quantity: null, unit: null },
        ],
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id

  // Eigen namen: layout.spec.js maakt zelf melk, brood enz. aan.
  for (const item of [
    { name: 'havermout', category: 'ontbijt' },
    { name: 'koffie', category: null },
  ]) {
    const response = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(response.status(), await response.text()).toBe(201)
    standardIds.push((await response.json()).id)
  }
})

test.beforeEach(async ({ page }) => {
  const cleared = await api.delete('/api/shopping_list_items/clear_all')
  expect(cleared.status()).toBe(204)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: NOTCH })
})

// Opruimen, zodat de andere specs met een lege standaardlijst beginnen.
test.afterAll(async () => {
  for (const id of standardIds) await api.delete(`/api/standard_items/${id}`)
  await api.dispose()
})

// Geen horizontale scroll, geen kopbalk, de h1 onder de statusbalk, en de laatste inhoud
// (de link "Beheer" onderaan) niet achter de menubalk. Daarna een screenshot.
async function checkPage(page, errors, name) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  // Is iets te breed, dan zoomt een telefoon uit en groeit innerWidth mee; dan zou de
  // regel hierboven niets zien. Daarom ook: de pagina is precies schermbreed.
  expect(innerWidth, 'niet uitgezoomd').toBe(page.viewportSize().width)
  await expect(page.locator('header, .site-header, .brand')).toHaveCount(0)

  await page.evaluate(() => window.scrollTo(0, 0))
  const h1 = await page.locator('h1').boundingBox()
  expect(h1.y, 'titel onder de statusbalk').toBeGreaterThanOrEqual(NOTCH.top)

  await page.screenshot({ path: `e2e/screenshots/compact-${name}.png`, animations: 'disabled' })

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const footer = await page.getByRole('link', { name: 'Beheer' }).boundingBox()
  const nav = await page.locator('.main-nav').boundingBox()
  expect(footer.y + footer.height, 'laatste inhoud boven de menubalk').toBeLessThanOrEqual(nav.y)
  // De menubalk zelf laat de thuisbalk vrij en is compact.
  expect(nav.y + nav.height).toBe(844)
  expect(nav.height).toBeLessThanOrEqual(52 + NOTCH.bottom + 1)
  await page.evaluate(() => window.scrollTo(0, 0))

  expect(errors, 'geen console-errors').toEqual([])
}

test('receptenoverzicht', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.locator('.recipe-grid .title').first()).toBeVisible()
  await checkPage(page, errors, 'recepten')
})

test('recept toevoegen: porties en tags op één rij, velden zonder zoom', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await expect(page.getByRole('heading', { name: 'Recept toevoegen' })).toBeVisible()

  // Porties smal links, de tag-keuzelijst rechts, op dezelfde hoogte.
  const servings = await page.getByLabel('Porties').boundingBox()
  const tagSelect = await page.getByLabel('Tag toevoegen').boundingBox()
  expect(Math.abs(servings.y - tagSelect.y), 'zelfde rij').toBeLessThanOrEqual(1)
  expect(servings.x + servings.width).toBeLessThan(tagSelect.x)
  expect(servings.width).toBeLessThan(90)
  expect(tagSelect.x + tagSelect.width).toBeLessThanOrEqual(390 - 14)
  // Eén label voor de tags: "Tag toevoegen" is alleen nog voor schermlezers.
  await expect(page.getByText('Tag toevoegen', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Laat de hoeveelheid leeg')).toHaveCount(0)
  await expect(page.getByLabel('Hoeveelheid ingrediënt 1')).not.toHaveAttribute('placeholder')

  // Beschrijving: één regel, groeit mee, geen sleepgreep.
  const description = page.getByLabel('Beschrijving')
  const oneLine = (await description.boundingBox()).height
  expect(oneLine).toBeLessThanOrEqual(42)
  expect(await description.evaluate((el) => getComputedStyle(el).resize)).toBe('none')
  await description.fill('Regel een\nRegel twee\nRegel drie')
  expect((await description.boundingBox()).height).toBeGreaterThan(oneLine + 30)
  await description.fill('')
  expect((await description.boundingBox()).height).toBe(oneLine)

  // Geen iOS-zoom: elk invoerveld minstens 16 px; knoppen en velden minstens 40 hoog.
  const fields = await page
    .locator('input:not([type=checkbox]), select, textarea')
    .evaluateAll((els) =>
      els.map((el) => ({
        font: parseFloat(getComputedStyle(el).fontSize),
        height: el.getBoundingClientRect().height,
      })),
    )
  expect(fields.length).toBeGreaterThan(5)
  for (const field of fields) {
    expect(field.font).toBeGreaterThanOrEqual(16)
    expect(field.height).toBeGreaterThanOrEqual(40)
  }
  const buttons = await page
    .locator('main button')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  for (const height of buttons) expect(height).toBeGreaterThanOrEqual(40)

  // Focus op een veld: de pagina zoomt niet.
  await page.getByLabel('Titel').focus()
  const focused = await page.evaluate(() => ({
    font: parseFloat(getComputedStyle(document.activeElement).fontSize),
    scale: window.visualViewport.scale,
  }))
  expect(focused).toEqual({ font: 16, scale: 1 })

  await checkPage(page, errors, 'recept-toevoegen-boven')

  // Ingrediëntensectie, met de plakkende opslaan-knop boven de menubalk.
  await page.getByLabel('Naam ingrediënt 1').fill('bloem')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('1,5')
  await page.getByRole('button', { name: '+ ingrediënt' }).click()
  await page.locator('.ingredients').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -60))
  const bar = await page.locator('.submit-bar').boundingBox()
  const nav = await page.locator('.main-nav').boundingBox()
  expect(bar.y + bar.height, 'opslaan-knop boven de menubalk').toBeLessThanOrEqual(nav.y + 1)
  const addIngredient = await page.getByRole('button', { name: '+ ingrediënt' }).boundingBox()
  expect(addIngredient.y + addIngredient.height, 'niets onder de opslaan-knop').toBeLessThanOrEqual(
    bar.y,
  )
  await page.screenshot({
    path: 'e2e/screenshots/compact-recept-toevoegen-ingredienten.png',
    animations: 'disabled',
  })
})

test('receptdetail', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compacte pannenkoeken')
  await checkPage(page, errors, 'recept-detail')
})

test('boodschappenlijst', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeId}`)
  await page.locator('.add-all').click()
  await expect(page.getByRole('status')).toContainText('Alle ingrediënten')
  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toHaveCount(3)
  await checkPage(page, errors, 'boodschappen')
})

// "Standaardboodschappen" op één regel, zonder afbreekstreepje, op 390 én 375 px.
async function expectTitleOnOneLine(page) {
  const title = page.getByRole('heading', { level: 1, name: 'Standaardboodschappen' })
  const { lines, fits } = await title.evaluate((h1) => {
    const range = document.createRange()
    range.selectNodeContents(h1)
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
    return { lines: tops.size, fits: h1.scrollWidth <= h1.clientWidth }
  })
  expect(lines, 'één regel').toBe(1)
  expect(fits, 'past in de breedte').toBe(true)
}

test('standaardboodschappen: titel op één regel, geen ondertitel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/standaard')
  await expect(page.locator('.items .line').first()).toBeVisible()
  await expect(page.getByText('Wat je vaak koopt')).toHaveCount(0)
  await expectTitleOnOneLine(page)
  await checkPage(page, errors, 'standaard')

  await page.setViewportSize({ width: 375, height: 812 })
  await expectTitleOnOneLine(page)
  await page.screenshot({ path: 'e2e/screenshots/compact-standaard-375.png' })
})
