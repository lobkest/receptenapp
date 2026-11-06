import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'
import {
  checkLayout,
  collectErrors,
  ingredientRow,
  iphone,
  openOnline,
  postRecipe,
  setInHouse,
  shoppingList,
  shoppingRow,
  sleepServer,
} from './helpers.js'

// De app opstarten zonder bereikbare server, op een iPhone-scherm (de gebouwde app met
// service worker), op twee manieren:
// a. setOffline: de browser weet dat er geen netwerk is;
// b. het iPhone-geval: de browser denkt dat er netwerk is, maar /up en /api blijven hangen
//    (een Render-server die wakker wordt, of geen bereik), en antwoorden pas later.
// Zolang /up geen 200 gaf, is de app offline (stores/serverStatus.js): de banner staat er
// vanaf de eerste render, met een teller, en toevoegen gaat meteen via de outbox, zonder
// request. Pas na /up 200 gaat de outbox naar de server, één keer.
// Screenshots in e2e/screenshots/offline-start-<manier>-*.png.

let api
let recipe

const PREFIX = 'start-'
const RECIPE = {
  // Uniek per run: een herstarte worker (na een fout) maakt anders een tweede met dezelfde titel.
  title: `Opstart-pannenkoeken ${Date.now()}`,
  servings: 4,
  steps_attributes: [{ body: 'Bakken.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
    { ingredient_name: 'melk', quantity: 500, unit: 'ml' },
    { ingredient_name: 'ei', quantity: 2, unit: 'stuks' },
  ],
}
const TITLE = 'Offline: geen verbinding met de server'

async function cleanUp() {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const items = await (await api.get('/api/standard_items')).json()
  const ids = items.filter((item) => item.name.startsWith(PREFIX)).map((item) => item.id)
  if (ids.length) await api.post('/api/standard_items/bulk_destroy', { data: { ids } })
}

async function standardItem(name) {
  const response = await api.post('/api/standard_items', { data: { standard_item: { name } } })
  expect(response.status(), await response.text()).toBe(201)
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  recipe = await postRecipe(api, RECIPE)
})

test.beforeEach(async () => {
  await cleanUp()
  for (const name of ['bloem', 'melk', 'ei']) await setInHouse(api, name, false)
  await standardItem(`${PREFIX}thee`)
  await standardItem(`${PREFIX}koffie`)
})

test.afterEach(cleanUp)

test.afterAll(async () => {
  await deleteRecipe(api, recipe.id)
  await api.dispose()
})

// Per pagina-opbouw: stond de banner er al toen de pagina voor het eerst in <main> kwam?
// (Een MutationObserver vóór de app start; Vue zet de hele pagina in één keer neer.)
function recordFirstRender() {
  new MutationObserver((_mutations, observer) => {
    const main = document.querySelector('main')
    if (!main?.querySelector('.route-page, .offline-notice')) return
    window.firstRender = {
      notice: Boolean(main.querySelector('.offline-notice')),
      title: main.querySelector('.offline-title')?.textContent ?? null,
    }
    observer.disconnect()
  }).observe(document, { childList: true, subtree: true })
}

// Volgorde van wat er over de lijn gaat: elk verzoek naar /api, en elk /up-antwoord 200.
function recordTraffic(context) {
  const events = []
  context.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/api/')) events.push(`${request.method()} ${pathname}`)
  })
  context.on('response', (response) => {
    if (new URL(response.url()).pathname === '/up' && response.status() === 200) events.push('UP')
  })
  return events
}

const SCENARIOS = [
  {
    name: 'setoffline',
    title: 'a. setOffline bij een koude start',
    async cut(context) {
      await context.setOffline(true)
      return () => context.setOffline(false)
    },
    counter: (seconds) => new RegExp(`^geen internet op dit toestel · ${seconds} s$`),
  },
  {
    name: 'hangend',
    title: 'b. browser online, maar /up en /api blijven hangen; daarna antwoorden ze',
    cut: (context) => sleepServer(context),
    counter: (seconds) =>
      new RegExp(
        `^wachten op verbinding… ${seconds} s \\((opstarten duurt meestal ~50 s|duurt langer dan normaal)\\)$`,
      ),
  },
]

for (const scenario of SCENARIOS) {
  test(`${scenario.title}: banner vanaf de eerste render, toevoegen via de outbox, één keer naar de database`, async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const shot = (name) => `offline-start-${scenario.name}-${name}`
    const { context, page } = await iphone(browser)
    const errors = collectErrors(page, { ignoreFailedLoads: true })
    // Eén keer online: de app (service worker), de snapshot en de lijst staan lokaal.
    await openOnline(page)
    await page.goto('/standaard')
    await expect(page.locator('.items .line', { hasText: `${PREFIX}koffie` })).toBeVisible()

    await context.addInitScript(recordFirstRender)
    await page.clock.install()
    const traffic = recordTraffic(context)
    const restore = await scenario.cut(context)

    // ---- Koude start op elk tabblad: de banner staat er in de eerste render.
    const notice = page.locator('main .offline-notice')
    for (const path of ['/', '/standaard', '/boodschappen', '/in-huis']) {
      await page.goto(path)
      await expect
        .poll(() => page.evaluate(() => window.firstRender), { message: path })
        .toEqual({ notice: true, title: TITLE })
      await expect(notice.locator('.offline-title')).toHaveText(TITLE)
    }
    await expect(notice.locator('.offline-detail')).toHaveText(
      'In huis is offline niet beschikbaar',
    )

    // ---- De teller loopt (page.clock): ~5 s, en na 50 s "duurt langer dan normaal".
    await page.goto('/boodschappen')
    // Naast page.clock loopt ook de echte tijd door (de koude starts hierboven), dus we
    // vergelijken met de stand ervoor in plaats van een vast getal.
    const counter = notice.locator('.offline-counter')
    const seconds = async () => Number((await counter.textContent()).match(/(\d+) s/)[1])
    await expect(counter).toHaveText(scenario.counter('\\d+'))
    const before = await seconds()
    await page.clock.runFor(5_000)
    await expect.poll(seconds).toBeGreaterThanOrEqual(before + 5)
    await expect(counter).toHaveText(scenario.counter('\\d+'))
    await notice.screenshot({ path: `e2e/screenshots/${shot('banner-5s')}.png` })
    await page.clock.runFor(50_000)
    await expect.poll(seconds).toBeGreaterThanOrEqual(before + 55)
    await expect(counter).toHaveText(scenario.counter('\\d+'))
    if (scenario.name === 'hangend') await expect(counter).toContainText('duurt langer dan normaal')
    await notice.screenshot({ path: `e2e/screenshots/${shot('banner-55s')}.png` })

    // ---- Receptpagina (uit de snapshot): één ingrediënt, dan "Alles op lijst".
    await page.locator('.main-nav').getByRole('link', { name: 'Recepten' }).click()
    await page.locator('.recipe-card').filter({ hasText: RECIPE.title }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(RECIPE.title)
    await ingredientRow(page, 'bloem').locator('.list-button').click()
    await expect(ingredientRow(page, 'bloem').locator('.list-button')).toHaveText('✓ op lijst', {
      timeout: 1_000,
    })
    await page.getByRole('button', { name: 'Alles op lijst' }).click()
    await expect(ingredientRow(page, 'melk').locator('.list-button')).toHaveText('✓ op lijst', {
      timeout: 1_000,
    })
    await expect(page.getByRole('button', { name: 'Alles op lijst' })).toBeEnabled()

    // ---- Standaard: [+] bij thee, dan "Op lijst (2)" met thee en koffie.
    await page.locator('.main-nav').getByRole('link', { name: 'Standaard' }).click()
    await page.getByRole('button', { name: `${PREFIX}thee op boodschappenlijst` }).click()
    await expect(
      page.getByRole('button', {
        name: `${PREFIX}thee staat op je boodschappenlijst; tik voor nog één`,
      }),
    ).toBeVisible({ timeout: 1_000 })
    await page.getByRole('button', { name: 'Selecteren' }).click()
    for (const name of ['thee', 'koffie']) {
      await page
        .locator('.row.select', { hasText: `${PREFIX}${name}` })
        .locator('input')
        .check()
    }
    await page.locator('.add-selected').click()
    await expect(page.locator('.main-nav .nav-count')).toContainText('6', { timeout: 1_000 })

    // ---- De boodschappenlijst: alles staat er (binnen 1 s), "wacht op sync".
    await page
      .locator('.main-nav')
      .getByRole('link', { name: /^Boodschappen/ })
      .click()
    const quick = { timeout: 1_000 }
    await expect(shoppingRow(page, 'bloem')).toHaveCount(2, quick)
    await expect(shoppingRow(page, 'melk')).toHaveCount(1, quick)
    await expect(shoppingRow(page, /\bei\s*$/)).toHaveCount(1, quick)
    await expect(shoppingRow(page, `${PREFIX}thee`).locator('.stepper .value')).toHaveText('2')
    await expect(shoppingRow(page, `${PREFIX}koffie`)).toHaveCount(1, quick)
    await expect(page.locator('.offline-extra .pending')).toHaveText(
      '4 wijzigingen wachten op verbinding',
    )
    await checkLayout(page, errors, shot('boodschappen'), { scrollTop: true })

    // Tot nu toe geen enkel verzoek naar /api, en nog niets in de database.
    expect(traffic).toEqual([])
    expect(await shoppingList(api)).toEqual([])

    // ---- De server antwoordt: pas na /up 200 gaat de outbox, één keer.
    await restore()
    // Een volgende ping komt na de backoff (hooguit 15 s); de klok loopt verder.
    await page.clock.runFor(16_000)
    await expect(notice).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.pending-mark')).toHaveCount(0)
    const expected = [
      ['bloem', 250, 1],
      ['bloem', 250, 1],
      ['ei', 2, 1],
      ['melk', 500, 1],
      [`${PREFIX}koffie`, null, 1],
      [`${PREFIX}thee`, null, 2],
    ]
    const inDatabase = async () =>
      (await shoppingList(api))
        .map((item) => [item.name, item.quantity, item.count])
        .sort((a, b) => a[0].localeCompare(b[0]))
    await expect.poll(inDatabase).toEqual(expected)
    const firstApi = traffic.findIndex((event) => event !== 'UP')
    expect(traffic.indexOf('UP'), traffic.join(', ')).toBeGreaterThan(-1)
    expect(traffic.indexOf('UP'), traffic.join(', ')).toBeLessThan(firstApi)
    // Elke toevoeging precies één POST.
    const posts = traffic.filter((event) => event.startsWith('POST '))
    expect(posts.toSorted()).toEqual(
      [
        `POST /api/recipes/${recipe.id}/add_to_shopping_list`,
        `POST /api/recipes/${recipe.id}/add_to_shopping_list`,
        'POST /api/standard_items/add_to_shopping_list',
        'POST /api/standard_items/add_to_shopping_list',
      ].toSorted(),
    )

    // Nog een keer openen: niets dubbel.
    await page.reload()
    await expect(shoppingRow(page, 'bloem')).toHaveCount(2)
    expect(await inDatabase()).toEqual(expected)
    await context.close()
  })
}
