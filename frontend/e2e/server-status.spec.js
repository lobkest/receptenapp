import { test, expect } from '@playwright/test'
import { PWA_URL, RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'

// Een slapende of onbereikbare server, op iPhone- én desktopformaat (playwright.config.js):
// (a) traag: laadmelding op Recepten, de bewaarde lijst op Boodschappen;
// (b) API onbereikbaar en echt offline: Boodschappen toont de offline kopie;
// (c) daarna weer online: tags op de kaarten en het filter "glutenvrij" werkt.
// Plus: een nieuwere versie op de server laat de pagina één keer herladen.
//
// Op de gebouwde app (zoals productie, zonder Vite-HMR die bij offline gaat herladen), maar
// zonder service worker: zo vangt page.route() elk verzoek zeker zelf op.
// Screenshots in e2e/screenshots/serverstatus-<project>-*.png.

test.use({ baseURL: PWA_URL, serviceWorkers: 'block' })

const RICE = 'Rijstschotel serverstatus'
const BREAD = 'Tarwebrood serverstatus'
const WAKING = 'Server wordt wakker, ophalen… (kan ~1 minuut duren)'

let api
const recipeIds = []

async function createRecipe(title, ingredientName) {
  const created = await api.post('/api/recipes', {
    data: {
      recipe: {
        title,
        servings: 2,
        steps_attributes: [{ body: 'Alles koken.' }],
        recipe_ingredients_attributes: [
          { ingredient_name: ingredientName, quantity: 200, unit: 'g' },
        ],
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  recipeIds.push((await created.json()).id)
}

// Kenmerken direct zetten (het ingrediënt bestaat al door het recept); zonder hulprecept
// zoals giveTraits, dat de rate limit van beheer opmaakt.
async function setTraits(name, traitNames) {
  const ingredients = await (await api.get('/api/ingredients')).json()
  const ingredient = ingredients.find((i) => i.name === name)
  const response = await api.patch(`/api/ingredients/${ingredient.id}/traits`, {
    data: { ingredient: { trait_names: traitNames } },
  })
  expect(response.status(), await response.text()).toBe(200)
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  // Tarwemeel bevat gluten; zilvervliesrijst heeft geen kenmerken en is dus glutenvrij.
  await createRecipe(RICE, 'zilvervliesrijst serverstatus')
  await createRecipe(BREAD, 'tarwemeel serverstatus')
  await setTraits('zilvervliesrijst serverstatus', [])
  await setTraits('tarwemeel serverstatus', ['gluten'])
})

test.afterAll(async () => {
  for (const id of recipeIds.splice(0)) await deleteRecipe(api, id)
  await api.dispose()
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const created = await api.post('/api/shopping_list_items', {
    data: {
      shopping_list_items: [
        { name: 'melk', quantity: 500, unit: 'ml', source_label: 'standaard' },
        { name: 'eieren', source_label: 'standaard' },
      ],
    },
  })
  expect(created.status()).toBe(201)
})

// Alleen de API en de health check, niet /src/api/... of de assets.
function isServerRequest(url) {
  const { pathname } = new URL(url)
  return pathname === '/up' || pathname.startsWith('/api/')
}

// Een slapende server: elk verzoek blijft hangen tot wakeUp().
async function sleepServer(page) {
  const held = []
  const handler = (route) => held.push(route)
  await page.route(isServerRequest, handler)
  return async function wakeUp() {
    await page.unroute(isServerRequest, handler)
    for (const route of held.splice(0)) await route.continue().catch(() => {})
  }
}

// Een onbereikbare server: elk verzoek faalt meteen (zoals zonder verbinding).
async function cutServer(page) {
  const handler = (route) => route.abort('internetdisconnected')
  await page.route(isServerRequest, handler)
  return () => page.unroute(isServerRequest, handler)
}

// Console-errors, behalve de mislukte requests die we hier zelf veroorzaken.
function collectErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text())
    }
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
  await page.screenshot({
    path: `e2e/screenshots/serverstatus-${test.info().project.name}-${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
}

function lines(page) {
  return page.locator('.items .line')
}

async function checkedInDatabase() {
  const items = await (await api.get('/api/shopping_list_items')).json()
  return Object.fromEntries(items.map((item) => [item.name, item.checked]))
}

test('(a) trage server: laadmelding op Recepten, bewaarde lijst op Boodschappen', async ({
  page,
}) => {
  const errors = collectErrors(page)

  // Eerst één keer online: de lijst wordt lokaal bewaard, met tijdstip.
  await page.goto('/boodschappen')
  await expect(lines(page)).toHaveText(['500 ml melk', 'eieren'])
  await expect(page.locator('.offline-notice')).toHaveCount(0)

  // De server slaapt: geen antwoord op /up of /api.
  const wakeUp = await sleepServer(page)
  await page.goto('/')
  await expect(page.locator('.server-waiting')).toHaveText(WAKING)
  await expect(page.locator('.recipe-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Recepten' })).toHaveCount(0)
  await checkLayout(page, errors, 'a-recepten-wakker-worden')

  await page.goto('/boodschappen')
  await expect(page.locator('.offline-notice')).toHaveText(
    /^Offline kopie van \d\d:\d\d, bijwerken…/,
  )
  await expect(lines(page)).toHaveText(['500 ml melk', 'eieren'])
  await expect(page.locator('.server-waiting')).toHaveCount(0)
  await checkLayout(page, errors, 'a-boodschappen-kopie')

  // Wakker: de verse lijst vervangt de kopie, en Recepten laat de recepten zien.
  await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'brood', source_label: 'standaard' }] },
  })
  await wakeUp()
  await expect(lines(page)).toHaveText(['500 ml melk', 'eieren', 'brood'])
  await expect(page.locator('.offline-notice')).toHaveCount(0)

  await page.locator('nav').getByRole('link', { name: 'Recepten' }).click()
  await expect(page.locator('.recipe-card', { hasText: RICE })).toBeVisible()
  await expect(page.locator('.server-waiting')).toHaveCount(0)
})

test('(b) en (c): offline de kopie met wachtrij, daarna tags en filter "glutenvrij"', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page)

  await page.goto('/boodschappen')
  await expect(lines(page)).toHaveText(['500 ml melk', 'eieren'])

  // (b) De API is onbereikbaar: de offline kopie, en afvinken gaat in de wachtrij.
  const restore = await cutServer(page)
  await page.reload()
  await expect(lines(page)).toHaveText(['500 ml melk', 'eieren'])
  const notice = page.locator('.offline-notice')
  await expect(notice).toContainText(/^Offline kopie van \d\d:\d\d, bijwerken…/)
  await expect(notice).toContainText('Afvinken kan gewoon')
  await page.locator('.items input[type="checkbox"]').first().check()
  await expect(notice).toContainText('1 wijziging nog niet gesynchroniseerd')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await checkLayout(page, errors, 'b-boodschappen-api-onbereikbaar')

  // Echt offline (navigator.onLine false): "Offline" in plaats van "bijwerken…".
  await context.setOffline(true)
  await expect(notice).toContainText(/^Offline kopie van \d\d:\d\d, Offline/)
  await page.locator('.items input[type="checkbox"]').nth(1).check()
  await expect(notice).toContainText('2 wijzigingen nog niet gesynchroniseerd')
  await checkLayout(page, errors, 'b-boodschappen-offline')

  // Recepten toont offline geen oude data.
  await page.locator('nav').getByRole('link', { name: 'Recepten' }).click()
  await expect(page.locator('.server-waiting')).toContainText('Offline')
  await expect(page.locator('.recipe-card')).toHaveCount(0)
  await checkLayout(page, errors, 'b-recepten-offline')

  // (c) Weer verbinding en de server bereikbaar: de wachtrij gaat naar de server en de
  // recepten komen, met hun automatische tags.
  await restore()
  await context.setOffline(false)
  await expect.poll(checkedInDatabase).toEqual({ melk: true, eieren: true })

  const rice = page.locator('.recipe-card', { hasText: RICE })
  const bread = page.locator('.recipe-card', { hasText: BREAD })
  await expect(rice.locator('.tag', { hasText: 'glutenvrij' })).toBeVisible()
  await expect(bread).toBeVisible()
  await expect(bread.locator('.tag', { hasText: 'glutenvrij' })).toHaveCount(0)

  await page.locator('.tag-chips .filter-chip', { hasText: 'glutenvrij' }).click()
  await expect(page).toHaveURL(/tags=glutenvrij/)
  await expect(rice).toBeVisible()
  await expect(bread).toHaveCount(0)
  await expect(page.locator('.no-results')).toHaveCount(0)
  await checkLayout(page, errors, 'c-recepten-filter-glutenvrij')

  await page
    .locator('nav')
    .getByRole('link', { name: /Boodschappen/ })
    .click()
  await expect(page.locator('.offline-notice')).toHaveCount(0)
})

test('nieuwere versie op de server: de pagina herlaadt één keer', async ({ page }) => {
  const errors = collectErrors(page)
  // Rails stuurt in de testomgeving geen versie mee; hier doen we alsof er intussen een
  // nieuwe deploy staat.
  await page.route(
    (url) => new URL(url).pathname.startsWith('/api/'),
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'x-app-version': 'nieuwere-deploy' },
      })
    },
  )
  let loads = 0
  page.on('load', () => loads++)

  await page.goto('/')
  // Na het eerste API-antwoord herlaadt de pagina; daarna (zelfde serverversie) niet weer.
  await expect.poll(() => loads).toBe(2)
  await expect(page.locator('.recipe-card', { hasText: RICE })).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem('receptenapp:reloaded-for-version')),
  ).toBe('nieuwere-deploy')
  await page.waitForTimeout(1500)
  expect(loads).toBe(2)
  expect(errors).toEqual([])
})
