import { test, expect } from '@playwright/test'
import { PWA_URL, RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'
import {
  checkedInDatabase,
  checkLayout,
  collectErrors,
  isServerRequest,
  sleepServer,
  snapshotSaved,
  sorted,
  sortedLines,
} from './helpers.js'

// Een slapende of onbereikbare server, op iPhone- én desktopformaat (playwright.config.js):
// (a) traag: laadmelding op Recepten, de bewaarde lijst op Boodschappen;
// (b) API onbereikbaar en echt offline: Boodschappen toont de offline kopie;
// (c) daarna weer online: tags op de kaarten en het filter "glutenvrij" werkt.
// Plus: een nieuwere versie op de server laat de pagina één keer herladen.
//
// Op de gebouwde app (zoals productie, zonder Vite-HMR die bij offline gaat herladen), maar
// zonder service worker: zo vangt page.route() elk verzoek zeker zelf op.
// Screenshots in e2e/screenshots/serverstatus-<project>-*.png.

// Screenshots per project (iphone en desktop), want beide draaien deze spec.
function shot(name) {
  return `serverstatus-${test.info().project.name}-${name}`
}

test.use({ baseURL: PWA_URL, serviceWorkers: 'block' })

const RICE = 'Rijstschotel serverstatus'
const BREAD = 'Tarwebrood serverstatus'

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

// Een onbereikbare server: elk verzoek faalt meteen (zoals zonder verbinding).
async function cutServer(page) {
  const handler = (route) => route.abort('internetdisconnected')
  await page.route(isServerRequest, handler)
  return () => page.unroute(isServerRequest, handler)
}

test('(a) trage server: Recepten en Boodschappen tonen meteen de bewaarde kopie', async ({
  page,
}) => {
  const errors = collectErrors(page, { ignoreFailedLoads: true })

  // Eerst één keer online: de lijst en de offline snapshot (de recepten) worden lokaal
  // bewaard, met tijdstip.
  await page.goto('/boodschappen')
  await expect.poll(() => sortedLines(page)).toEqual(sorted(['500 ml melk', 'eieren']))
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await snapshotSaved(page)

  // De server slaapt: geen antwoord op /up of /api.
  const wakeUp = await sleepServer(page)
  await page.goto('/')
  // Met een snapshot geen laadmelding maar meteen de recepten (stale-while-revalidate).
  await expect(page.locator('.recipe-card', { hasText: RICE })).toBeVisible()
  await checkLayout(page, errors, shot('a-recepten-wakker-worden'))

  await page.goto('/boodschappen')
  await expect.poll(() => sortedLines(page)).toEqual(sorted(['500 ml melk', 'eieren']))
  // Een slapende server laat /up hangen, net als geen bereik: na de time-out van de ping
  // (8 s) zegt de melding eerlijk dat er geen verbinding is, met het tijdstip van de kopie.
  const notice = page.locator('.offline-notice')
  await expect(notice.locator('.offline-title')).toHaveText(
    'Offline: geen verbinding met de server',
    { timeout: 15_000 },
  )
  await expect(notice.locator('.offline-detail')).toHaveText(
    /^kopie van (vandaag|gisteren) \d\d:\d\d$/,
  )
  await checkLayout(page, errors, shot('a-boodschappen-kopie'))

  // Wakker: de verse lijst vervangt de kopie, en Recepten laat de recepten zien.
  await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'brood', source_label: 'standaard' }] },
  })
  await wakeUp()
  await expect.poll(() => sortedLines(page)).toEqual(sorted(['500 ml melk', 'eieren', 'brood']))
  await expect(page.locator('.offline-notice')).toHaveCount(0)

  await page.locator('nav').getByRole('link', { name: 'Recepten' }).click()
  await expect(page.locator('.recipe-card', { hasText: RICE })).toBeVisible()
})

test('(b) en (c): offline de kopie met wachtrij, daarna tags en filter "glutenvrij"', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page, { ignoreFailedLoads: true })

  await page.goto('/boodschappen')
  await expect.poll(() => sortedLines(page)).toEqual(sorted(['500 ml melk', 'eieren']))
  // Recepten komen straks uit de snapshot: die moet eerst bewaard zijn.
  await snapshotSaved(page)

  // (b) De API is onbereikbaar: de offline kopie, en afvinken gaat in de wachtrij.
  const restore = await cutServer(page)
  await page.reload()
  await expect.poll(() => sortedLines(page)).toEqual(sorted(['500 ml melk', 'eieren']))
  const notice = page.locator('.offline-notice')
  const extra = page.locator('.offline-extra')
  await expect(notice.locator('.offline-title')).toHaveText(
    'Offline: geen verbinding met de server',
  )
  await expect(notice.locator('.offline-detail')).toHaveText(
    /^kopie van (vandaag|gisteren) \d\d:\d\d$/,
  )
  // De uitleg en de wachtende wijzigingen staan onder het blok, niet erin.
  await expect(extra).toContainText('Afvinken, het aantal, verwijderen en toevoegen kan gewoon')
  await page.locator('.items input[type="checkbox"]').first().check()
  await expect(extra).toContainText('1 wijziging wacht op verbinding')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await checkLayout(page, errors, shot('b-boodschappen-api-onbereikbaar'))

  // Echt offline (navigator.onLine false): dezelfde melding.
  await context.setOffline(true)
  await expect(notice.locator('.offline-detail')).toHaveText(
    /^kopie van (vandaag|gisteren) \d\d:\d\d$/,
  )
  await page.locator('.items input[type="checkbox"]').nth(1).check()
  await expect(extra).toContainText('2 wijzigingen wachten op verbinding')
  await checkLayout(page, errors, shot('b-boodschappen-offline'))

  // Recepten toont offline de kopie uit de snapshot, met de offline-melding.
  await page.locator('nav').getByRole('link', { name: 'Recepten' }).click()
  await expect(page.locator('.recipe-card', { hasText: RICE })).toBeVisible()
  await expect(page.locator('.offline-notice .offline-title')).toHaveText(
    'Offline: geen verbinding met de server',
  )
  await checkLayout(page, errors, shot('b-recepten-offline'))

  // (c) Weer verbinding en de server bereikbaar: de wachtrij gaat naar de server en de
  // recepten komen, met hun automatische tags.
  await restore()
  await context.setOffline(false)
  await expect.poll(() => checkedInDatabase(api)).toEqual({ melk: true, eieren: true })

  const rice = page.locator('.recipe-card', { hasText: RICE })
  const bread = page.locator('.recipe-card', { hasText: BREAD })
  await expect(rice.getByRole('img', { name: 'glutenvrij' })).toBeVisible()
  await expect(bread).toBeVisible()
  await expect(bread.getByRole('img', { name: 'glutenvrij' })).toHaveCount(0)

  await page.locator('.tag-chips .filter-chip', { hasText: 'glutenvrij' }).click()
  await expect(page).toHaveURL(/tags=glutenvrij/)
  await expect(rice).toBeVisible()
  await expect(bread).toHaveCount(0)
  await expect(page.locator('.no-results')).toHaveCount(0)
  await checkLayout(page, errors, shot('c-recepten-filter-glutenvrij'))

  await page
    .locator('nav')
    .getByRole('link', { name: /Boodschappen/ })
    .click()
  await expect(page.locator('.offline-notice')).toHaveCount(0)
})

test('nieuwere versie op de server: de pagina herlaadt één keer', async ({ page }) => {
  const errors = collectErrors(page, { ignoreFailedLoads: true })
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
