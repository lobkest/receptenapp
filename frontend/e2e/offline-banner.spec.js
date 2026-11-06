import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL, useOwnIp } from './env.js'
import {
  checkLayout,
  collectErrors,
  hangServer,
  ingredientId,
  iphone,
  navigateInApp,
  openOnline,
  postRecipe,
  slowServer,
} from './helpers.js'

// Eén offline-melding (components/OfflineNotice.vue) op elk tabblad en elke pagina eronder,
// overal hetzelfde blok: regel 1 letterlijk gelijk, regel 2 per pagina, op dezelfde plek en in
// dezelfde opmaak. Op de gebouwde app (met service worker), op een iPhone-scherm, op twee
// manieren zonder verbinding:
// - setOffline: de browser weet dat er geen netwerk is (vliegtuigmodus);
// - hangend: de browser denkt dat er netwerk is, maar elk verzoek blijft hangen (een
//   telefoon zonder bereik). Dan is de app offline na de time-out van de ping.
// Screenshots in e2e/screenshots/offline-melding-<manier>-<pagina>.png, en alles naast
// elkaar in e2e/screenshots/offline-melding-overzicht.png.

let api
let recipe
let flourId

const RECIPE = {
  title: 'Melding-pannenkoeken',
  servings: 2,
  steps_attributes: [{ body: 'Bakken.' }],
  recipe_ingredients_attributes: [{ ingredient_name: 'bloem', quantity: 250, unit: 'g' }],
}

const TITLE = 'Offline: geen verbinding met de server'
const COPY = /^kopie van (vandaag|gisteren) \d\d:\d\d$/
const EDITING = 'opslaan kan weer zodra er verbinding is'
const unavailable = (name) => `${name} is offline niet beschikbaar`
// De ping naar /up (PING_TIMEOUT_MS = 8 s) plus wat marge.
const HANG_TIMEOUT = 15_000

// [naam, hoe je er komt, verwachte regel 2]
function pages() {
  return [
    ['recepten', { nav: 'Recepten' }, COPY],
    ['receptdetail', { card: RECIPE.title }, COPY],
    ['in-huis', { nav: 'In huis' }, unavailable('In huis')],
    ['recept-toevoegen', { nav: 'Recept toevoegen' }, unavailable('Recept toevoegen')],
    ['boodschappen', { nav: /^Boodschappen/ }, COPY],
    ['standaard', { nav: 'Standaard' }, COPY],
    ['ingredienten', { footer: 'Ingrediënten' }, unavailable('Ingrediënten')],
    ['beheer', { footer: 'Beheer' }, unavailable('Beheer')],
    ['recept-bewerken', { path: `/recepten/${recipe.id}/bewerken` }, EDITING],
    ['ingredient-bewerken', { path: `/ingredienten/${flourId}` }, EDITING],
    ['versies', { path: `/beheer/recepten/${recipe.id}/versies` }, EDITING],
  ]
}

// De opmaak en plek van de melding: moet op elke pagina gelijk zijn.
function noticeLook(notice) {
  return notice.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const main = document.querySelector('main').getBoundingClientRect()
    const title = getComputedStyle(element.querySelector('.offline-title'))
    const detail = getComputedStyle(element.querySelector('.offline-detail'))
    return {
      component: element.className,
      background: style.backgroundColor,
      border: style.border,
      radius: style.borderRadius,
      padding: style.padding,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      titleWeight: title.fontWeight,
      titleColor: title.color,
      detailColor: detail.color,
      left: box.left,
      width: box.width,
      height: box.height,
      // Bovenaan: geen kop of iets anders erboven.
      top: Math.round(box.top - main.top),
      first: element === document.querySelector('main .offline-notice, main h1, main form'),
    }
  })
}

async function goTo(page, to) {
  if (to.nav) await page.locator('.main-nav').getByRole('link', { name: to.nav }).click()
  if (to.footer) await page.locator('footer').getByRole('link', { name: to.footer }).click()
  if (to.card) {
    await page.locator('.main-nav').getByRole('link', { name: 'Recepten' }).click()
    await page.locator('.recipe-card').filter({ hasText: to.card }).first().click()
  }
  if (to.path) await navigateInApp(page, to.path)
}

// Alle pagina's langs; per pagina de melding controleren en een screenshot.
// Geeft [{ name, title, look, shot }] terug.
async function checkEveryPage(page, errors, mode, timeout) {
  const results = []
  for (const [name, to, detail] of pages()) {
    await goTo(page, to)
    const notice = page.locator('main .offline-notice:visible')
    await expect(notice, `${mode} ${name}`).toHaveCount(1, { timeout })
    await expect(notice.locator('.offline-detail'), `${mode} ${name}`).toHaveText(detail)
    // Geen laadmelding en geen foutblok naast de melding.
    await expect(page.locator('main .notice-error:visible')).toHaveCount(0)
    // Ook geen "… laden…" dat blijft staan omdat een verzoek hangt.
    await expect(page.locator('main :visible', { hasText: /laden…$/ })).toHaveCount(0)
    // Wat alleen online kan, staat uit (hier: wissen op Boodschappen).
    if (name === 'boodschappen') await expect(page.locator('.clear-all')).toBeDisabled()

    await page.evaluate(() => window.scrollTo(0, 0))
    const shot = await page.screenshot({ animations: 'disabled' })
    await checkLayout(page, errors, `offline-melding-${mode}-${name}`, { scrollTop: true })
    results.push({
      name,
      title: await notice.locator('.offline-title').textContent(),
      look: await noticeLook(notice),
      shot,
    })
  }
  return results
}

function expectSameEverywhere(results, mode) {
  for (const { name, title } of results) expect(title, `${mode} ${name}: regel 1`).toBe(TITLE)
  const [first, ...rest] = results
  for (const { name, look } of rest) {
    expect(look, `${mode}: melding op ${name} gelijk aan die op ${first.name}`).toEqual(first.look)
  }
}

async function freshPhone(browser) {
  const { context, page } = await iphone(browser)
  await useOwnIp(page, 51)
  // Ingelogd voor Beheer > versies.
  await page.addInitScript((code) => sessionStorage.setItem('adminCode', code), ADMIN_TOKEN)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await openOnline(page)
  // De pagina's één keer online, zodat hun data (lijst, voorraad) bewaard is.
  await page
    .locator('.main-nav')
    .getByRole('link', { name: /^Boodschappen/ })
    .click()
  await expect(page.locator('main h1')).toHaveText('Boodschappen')
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  return { context, page, errors }
}

const overview = {}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  recipe = await postRecipe(api, RECIPE)
  const updated = await api.patch(`/api/recipes/${recipe.id}`, {
    data: { recipe: { lock_version: recipe.lock_version, description: 'Dun.' } },
  })
  expect(updated.status(), await updated.text()).toBe(200)
  flourId = await ingredientId(api, 'bloem')
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const added = await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'uien', source_label: 'standaard' }] },
  })
  expect(added.status(), await added.text()).toBe(201)
})

test.afterAll(async ({ browser }) => {
  await api.delete('/api/shopping_list_items/clear_all')
  await api.dispose()

  // Eén afbeelding met alle pagina's naast elkaar, per manier een rij.
  const rows = Object.entries(overview)
  if (rows.length === 0) return
  const page = await browser.newPage({ viewport: { width: 2400, height: 800 } })
  const cell = (name, shot) =>
    `<figure><img src="data:image/png;base64,${shot.toString('base64')}"><figcaption>${name}</figcaption></figure>`
  await page.setContent(`<!doctype html><style>
      body { margin: 8px; background: #888; font: 14px sans-serif; }
      h2 { margin: 8px 0 4px; }
      .row { display: flex; gap: 6px; }
      figure { margin: 0; width: 210px; }
      img { width: 210px; display: block; }
      figcaption { text-align: center; }
    </style>${rows
      .map(
        ([mode, results]) =>
          `<h2>${mode}</h2><div class="row">${results.map((r) => cell(r.name, r.shot)).join('')}</div>`,
      )
      .join('')}`)
  await page.screenshot({ path: 'e2e/screenshots/offline-melding-overzicht.png', fullPage: true })
  await page.close()
})

test('offline (setOffline), ook naar een ander tabblad: overal dezelfde melding', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { context, page, errors } = await freshPhone(browser)

  await context.setOffline(true)
  const results = await checkEveryPage(page, errors, 'setOffline', 5_000)
  expectSameEverywhere(results, 'setOffline')
  overview.setOffline = results

  // In huis: alleen de melding, geen lijst en geen invoer.
  await goTo(page, { nav: 'In huis' })
  const main = page.locator('main')
  await expect(main.locator('h1:visible')).toHaveCount(0)
  await expect(main.locator('input:visible, textarea:visible, select:visible')).toHaveCount(0)

  // De app offline opnieuw openen: meteen dezelfde melding.
  await page.reload()
  await expect(page.locator('main .offline-notice .offline-title')).toHaveText(TITLE)
  await context.close()
})

test('hangende verbinding (geen bereik): na de time-out overal dezelfde melding', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const { context, page, errors } = await freshPhone(browser)

  // Geen bereik, en de app opnieuw openen (de browser denkt nog dat er netwerk is).
  await hangServer(context)
  await page.reload()
  const results = await checkEveryPage(page, errors, 'hangend', HANG_TIMEOUT)
  expectSameEverywhere(results, 'hangend')
  overview.hangend = results
  await context.close()
})

test('bereik valt weg terwijl de app open is: terug naar de app geeft de melding', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const { context, page } = await freshPhone(browser)

  await hangServer(context)
  // Terug naar de app (een telefoon uit de zak): de app pingt; die blijft hangen.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const notice = page.locator('main .offline-notice')
  await expect(notice.locator('.offline-title')).toHaveText(TITLE, { timeout: HANG_TIMEOUT })
  await expect(notice.locator('.offline-detail')).toHaveText(COPY)
  await context.close()
})

test('trage verbinding: de melding alleen tot /up antwoordt, daarna laadt de pagina gewoon', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const { context, page } = await freshPhone(browser)

  await slowServer(context, 2_500)
  await page.reload()
  // Tot /up antwoordt telt de app als offline (ook vlak na het starten): de melding met teller.
  await expect(page.locator('main .offline-notice .offline-counter')).toHaveText(
    /^wachten op verbinding… \d+ s/,
  )
  await expect(page.locator('.offline-notice')).toHaveCount(0, { timeout: 10_000 })
  await page.locator('footer').getByRole('link', { name: 'Ingrediënten' }).click()
  await expect(page.locator('main h1')).toHaveText('Ingrediënten', { timeout: 15_000 })
  await page.locator('.main-nav').getByRole('link', { name: 'Recepten' }).click()
  await expect(page.locator('.recipe-card').first()).toBeVisible()
  // Langer dan de time-out van de ping: nog steeds geen melding.
  await page.waitForTimeout(9_000)
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await context.close()
})
