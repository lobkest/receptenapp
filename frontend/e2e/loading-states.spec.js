import { test, expect } from '@playwright/test'
import { PWA_URL } from './env.js'
import { collectErrors, isServerRequest } from './helpers.js'

// Elk tabblad dat de server nodig heeft, toont bij (a) offline, (b) laden (net geopend) en
// (c) een trage start (> 5 s) dezelfde gedeelde offline-melding (OfflineNotice, via App.vue)
// met "… is offline niet beschikbaar" en de teller, en verder niets: geen kop, geen chips,
// geen invoer. Een server die nog wakker wordt, telt als offline (stores/serverStatus.js).
// Boodschappen hoort er bewust niet bij:
// die toont offline meteen de opgeslagen lijst. Recepten en Standaard (meta.offline) ook
// niet zodra er een offline snapshot is: die tonen dan de kopie (zie
// e2e/offline-banner.spec.js en e2e/offline-sync.spec.js).
//
// Op de gebouwde app zonder service worker, net als e2e/server-status.spec.js: zo vangt
// page.route() elk verzoek zelf op. Screenshots in e2e/screenshots/laadstatus-*.png.

test.use({ baseURL: PWA_URL, serviceWorkers: 'block' })

// [naam in screenshots, adres, link in het menu of de footer, naam in de melding]
const TABS = [
  ['recepten', '/', 'Recepten', 'Recepten'],
  ['in-huis', '/in-huis', 'In huis', 'In huis'],
  ['recept', '/recepten/nieuw', 'Recept toevoegen', 'Recept toevoegen'],
  ['standaard', '/standaard', 'Standaard', 'Standaardboodschappen'],
  ['ingredienten', '/ingredienten', 'Ingrediënten', 'Ingrediënten'],
]

// Deze tonen offline de kopie uit de snapshot in plaats van de melding.
const OFFLINE_TABS = ['recepten', 'standaard']

// Alleen de gedeelde melding in beeld, met "<offlineName> is offline niet beschikbaar" en de
// teller (counter: een RegExp); de screenshot van <main> komt terug om te vergelijken.
async function expectOnlyNotice(page, offlineName, counter, name) {
  const main = page.locator('main')
  const notice = main.locator('.offline-notice')
  await expect(notice).toHaveCount(1)
  await expect(notice.locator('.offline-detail')).toHaveText(
    `${offlineName} is offline niet beschikbaar`,
  )
  await expect(notice.locator('.offline-counter')).toHaveText(counter)
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
  // De seconden lopen op; de rest van het blok blijft gelijk.
  return main.screenshot({ animations: 'disabled', mask: [notice.locator('.offline-counter')] })
}

test('(a) offline: op elk tabblad alleen de offline-melding, daarna haalt In huis zelf op', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recepten' })).toBeVisible()

  await context.setOffline(true)
  for (const [name, , link, offlineName] of TABS) {
    await page.getByRole('link', { name: link, exact: true }).click()
    if (OFFLINE_TABS.includes(name)) {
      // De snapshot van het openen hierboven: de pagina zelf, met de offline-melding.
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page.locator('main .offline-notice')).toBeVisible()
      continue
    }
    await expectOnlyNotice(
      page,
      offlineName,
      /^geen internet op dit toestel · \d+ s$/,
      `${name}-offline`,
    )
  }

  // Weer verbinding: In huis opent en haalt de voorraad op, zonder te herladen.
  await page.getByRole('link', { name: 'In huis', exact: true }).click()
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'In huis', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Voorraad' })).toBeVisible()
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await page.screenshot({
    path: 'e2e/screenshots/laadstatus-in-huis-weer-online.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
})

test('(b) laden en (c) trage start: op elk tabblad dezelfde offline-melding', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  // Een trage server (Render cold start): elk antwoord komt pas na 10 seconden.
  await page.route(isServerRequest, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000))
    await route.continue().catch(() => {})
  })

  const loading = []
  const slow = []
  const waiting = /^wachten op verbinding… \d+ s \(opstarten duurt meestal ~50 s\)$/
  for (const [name, path, , offlineName] of TABS) {
    const opened = Date.now()
    await page.goto(path)
    // (b) net geopend: de melding staat er meteen (vanaf de eerste render).
    loading.push([name, await expectOnlyNotice(page, offlineName, waiting, `${name}-laden`)])
    // (c) na ruim 5 seconden nog steeds alleen de melding; de teller loopt.
    await page.waitForTimeout(5_500 - (Date.now() - opened))
    await expect(page.locator('main .offline-counter')).toHaveText(/… [5-9] s/)
    slow.push([name, await expectOnlyNotice(page, offlineName, waiting, `${name}-traag`)])
  }
  // Per tabblad: bij laden en bij een trage start precies hetzelfde in beeld. (Tussen de
  // tabbladen verschilt regel 2, de paginanaam; de opmaak vergelijkt e2e/offline-banner.spec.js.)
  for (const [index, [name, shot]] of loading.entries()) {
    expect(slow[index][1].equals(shot), `${name}: laden en trage start dezelfde melding`).toBe(true)
  }

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  expect(errors, 'geen console-errors').toEqual([])
})
