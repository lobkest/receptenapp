import { test, expect } from '@playwright/test'
import { PWA_URL } from './env.js'
import { collectErrors, isServerRequest } from './helpers.js'

// Elk tabblad dat de server nodig heeft, toont in dezelfde drie toestanden precies dezelfde
// gedeelde melding (ServerWaiting in App.vue), en verder niets: geen kop, geen chips, geen
// invoer. (a) offline, (b) laden (net geopend) en (c) een trage start (> 5 s). Boodschappen
// hoort er bewust niet bij: die toont offline meteen de opgeslagen lijst.
//
// Op de gebouwde app zonder service worker, net als e2e/server-status.spec.js: zo vangt
// page.route() elk verzoek zelf op. Screenshots in e2e/screenshots/laadstatus-*.png.

test.use({ baseURL: PWA_URL, serviceWorkers: 'block' })

const WAKING = 'Server wordt wakker, ophalen… (kan ~1 minuut duren)'
const OFFLINE = 'Offline. Zodra er weer verbinding is, wordt alles opgehaald.'

// [naam in screenshots, adres, link in het menu of de footer]
const TABS = [
  ['recepten', '/', 'Recepten'],
  ['in-huis', '/in-huis', 'In huis'],
  ['recept', '/recepten/nieuw', 'Recept toevoegen'],
  ['standaard', '/standaard', 'Standaard'],
  ['ingredienten', '/ingredienten', 'Ingrediënten'],
]

// Alleen de gedeelde melding in beeld; de screenshot van <main> komt terug om te vergelijken.
async function expectOnlyNotice(page, text, name) {
  const main = page.locator('main')
  await expect(main.locator('.server-waiting')).toHaveText(text)
  await expect(main.locator('h1:visible')).toHaveCount(0)
  await expect(main.locator('.filter-chip:visible')).toHaveCount(0)
  await expect(main.locator('input:visible, textarea:visible, select:visible')).toHaveCount(0)
  await expect(main.locator('.notice-error:visible')).toHaveCount(0)
  await expect(main.getByText('Opnieuw proberen')).toHaveCount(0)

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  await page.screenshot({
    path: `e2e/screenshots/laadstatus-${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  return main.screenshot({ animations: 'disabled' })
}

// Alle screenshots van <main> moeten pixel voor pixel gelijk zijn.
function expectSameNotice(shots) {
  const [[firstName, first], ...rest] = shots
  for (const [name, shot] of rest) {
    expect(shot.equals(first), `melding op ${name} gelijk aan die op ${firstName}`).toBe(true)
  }
}

test('(a) offline: op elk tabblad alleen de gedeelde melding, daarna haalt In huis zelf op', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recepten' })).toBeVisible()

  await context.setOffline(true)
  const shots = []
  for (const [name, , link] of TABS) {
    await page.getByRole('link', { name: link, exact: true }).click()
    shots.push([name, await expectOnlyNotice(page, OFFLINE, `${name}-offline`)])
    await expect(page.locator('.server-waiting .spinner')).toHaveCount(0)
  }
  expectSameNotice(shots)

  // Weer verbinding: In huis opent en haalt de voorraad op, zonder te herladen.
  await page.getByRole('link', { name: 'In huis', exact: true }).click()
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'In huis', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Voorraad' })).toBeVisible()
  await expect(page.locator('.server-waiting')).toHaveCount(0)
  await page.screenshot({
    path: 'e2e/screenshots/laadstatus-in-huis-weer-online.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
})

test('(b) laden en (c) trage start: op elk tabblad dezelfde laadmelding', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  // Een trage server (Render cold start): elk antwoord komt pas na 10 seconden.
  await page.route(isServerRequest, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000))
    await route.continue().catch(() => {})
  })

  const loading = []
  const slow = []
  for (const [name, path] of TABS) {
    const opened = Date.now()
    await page.goto(path)
    // (b) net geopend; de melding verschijnt na een halve seconde (zie ServerWaiting.vue).
    await page.waitForTimeout(1_000)
    loading.push([name, await expectOnlyNotice(page, WAKING, `${name}-laden`)])
    // (c) na ruim 5 seconden nog steeds alleen de melding.
    await page.waitForTimeout(5_500 - (Date.now() - opened))
    slow.push([name, await expectOnlyNotice(page, WAKING, `${name}-traag`)])
  }
  expectSameNotice(loading)
  expectSameNotice(slow)
  expect(slow[0][1].equals(loading[0][1]), 'laden en trage start dezelfde melding').toBe(true)

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  expect(errors, 'geen console-errors').toEqual([])
})
