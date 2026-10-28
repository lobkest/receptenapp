import { expect } from '@playwright/test'

// Wat meerdere specs nodig hebben. API-hulpjes krijgen de request-context van de spec mee
// (api, zie traits.js); pagina-hulpjes de page.

// --- Layout en fouten ---

// Verzamelt console-errors en paginafouten; checkLayout eist dat er geen zijn.
// ignoreFailedLoads: een bewust onbereikbare server (serverstatus, laadtoestanden) geeft
// "Failed to load resource" in de console; dat telt dan niet mee.
export function collectErrors(page, { ignoreFailedLoads = false } = {}) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (ignoreFailedLoads && message.text().startsWith('Failed to load resource')) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

// Geen horizontale overflow, niet uitgezoomd en geen console-errors; met name ook een
// screenshot in e2e/screenshots/<name>.png.
// scrollTop: eerst naar boven, zodat een fullPage-screenshot de kop laat zien.
export async function checkLayout(
  page,
  errors,
  name = null,
  { fullPage = true, scrollTop = false } = {},
) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  // Is iets te breed, dan zoomt een telefoon uit en groeit innerWidth mee; dan zou de
  // regel hierboven niets zien. Daarom ook: de pagina is precies schermbreed.
  expect(innerWidth, 'niet uitgezoomd').toBe(page.viewportSize().width)
  if (name) {
    if (scrollTop) await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage, animations: 'disabled' })
  }
  expect(errors, 'geen console-errors').toEqual([])
}

// --- Pagina's ---

// Een ingrediënt op de receptpagina, op de tekst van de regel ("200 g kip" past op "kip").
export function ingredientRow(page, name) {
  return page
    .locator('.ingredients > ul > li')
    .filter({ has: page.locator('.line', { hasText: name }) })
}

// path: '/boodschappen', of met ?groeperen=… erachter.
export async function openShoppingList(page, path = '/boodschappen') {
  await page.goto(path)
  // Per categorie een eigen .items; de eerste is genoeg.
  await expect(page.locator('.items').first()).toBeVisible()
}

export function sorted(texts) {
  return texts.toSorted((a, b) => a.localeCompare(b, 'nl'))
}

// De regels op de boodschappenlijst, alfabetisch (de volgorde op het scherm hangt af van
// de groepering).
export async function sortedLines(page) {
  const texts = await page.locator('.items .line').allTextContents()
  return sorted(texts.map((text) => text.trim()))
}

// Een request naar Rails (de API of de health check /up), niet naar Vite.
export function isServerRequest(url) {
  const { pathname } = new URL(url)
  return pathname === '/up' || pathname.startsWith('/api/')
}

// --- API ---

// recipe: de velden zoals POST /api/recipes ze wil (title, steps_attributes, ...).
// Geeft het aangemaakte recept terug, met de regels (en hun id's) in ingredients.
export async function postRecipe(api, recipe) {
  const created = await api.post('/api/recipes', { data: { recipe } })
  expect(created.status(), await created.text()).toBe(201)
  return created.json()
}

// Het id van een bestaand ingrediënt, of undefined.
export async function ingredientId(api, name) {
  const ingredients = await (await api.get('/api/ingredients')).json()
  return ingredients.find((ingredient) => ingredient.name === name)?.id
}

export async function shoppingList(api) {
  return (await api.get('/api/shopping_list_items')).json()
}

// { naam: afgevinkt } voor elke regel op de server.
export async function checkedInDatabase(api) {
  const items = await shoppingList(api)
  return Object.fromEntries(items.map((item) => [item.name, item.checked]))
}

// Eén regel van een recept (op naam) op de boodschappenlijst, zoals "+ lijst".
export async function addFromRecipe(api, recipe, rowName) {
  const row = recipe.ingredients.find((ingredient) => ingredient.name === rowName)
  const response = await api.post(`/api/recipes/${recipe.id}/add_to_shopping_list`, {
    data: { ingredient_ids: [row.id] },
  })
  expect(response.status(), await response.text()).toBe(201)
}

export async function setInHouse(api, name, present) {
  const response = await api.patch(`/api/pantry/ingredients/${await ingredientId(api, name)}`, {
    data: { pantry_item: { present } },
  })
  expect(response.status(), await response.text()).toBe(200)
}
