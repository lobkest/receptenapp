import { test, expect, devices } from '@playwright/test'
import { PWA_URL, RAILS_URL } from './env.js'

// De boodschappenlijst offline, zoals in de winkel zonder bereik: op de gebouwde app
// (met service worker), op een geëmuleerde iPhone. De database is de testdatabase.

let api

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
})

test.beforeEach(async () => {
  const cleared = await api.delete('/api/shopping_list_items/clear_all')
  expect(cleared.status()).toBe(204)
})

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
  expect(innerWidth, 'niet uitgezoomd').toBe(page.viewportSize().width)

  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
}

// De stand in de database, per naam.
async function checkedInDatabase() {
  const response = await api.get('/api/shopping_list_items')
  const items = await response.json()
  return Object.fromEntries(items.map((item) => [item.name, item.checked]))
}

test('pwa: manifest en service worker staan in de root', async ({ request }) => {
  const manifest = await request.get(`${PWA_URL}/manifest.webmanifest`)
  expect(manifest.status()).toBe(200)
  expect(await manifest.json()).toMatchObject({
    name: 'Receptenapp',
    start_url: '/',
    display: 'standalone',
    icons: [{ sizes: '192x192' }, { sizes: '512x512' }],
  })

  const sw = await request.get(`${PWA_URL}/sw.js`)
  expect(sw.status()).toBe(200)
  expect(await sw.text()).toContain('index.html')
})

test('boodschappen: offline afvinken, daarna online naar de database', async ({ browser }) => {
  const created = await api.post('/api/shopping_list_items', {
    data: {
      shopping_list_items: [
        { name: 'bloem', quantity: 250, unit: 'g', source_label: 'Pannenkoeken' },
        { name: 'melk', quantity: 500, unit: 'ml', source_label: 'Pannenkoeken' },
        { name: 'wc-papier', source_label: 'standaard' },
      ],
    },
  })
  expect(created.status()).toBe(201)

  const context = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    baseURL: PWA_URL,
  })
  const page = await context.newPage()
  const errors = collectErrors(page)
  const checkboxes = page.locator('.items input[type="checkbox"]')
  const patches = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches.push(JSON.parse(r.postData()).shopping_list_item)
  })

  // Online openen: de lijst komt van de server en wordt opgeslagen. De service worker
  // installeert zich en bewaart de app zelf.
  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toHaveText(['250 g bloem', '500 ml melk', 'wc-papier'])
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await expect(page.locator('.clear-all')).toBeEnabled()
  await checkLayout(page, errors, 'boodschappen-online')

  // Geen verbinding, en de pagina herladen: de app en de lijst komen uit de opslag.
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.offline-notice')).toContainText(/Offline – opgeslagen om \d\d:\d\d/)
  await expect(page.locator('.items .line')).toHaveText(['250 g bloem', '500 ml melk', 'wc-papier'])

  // Afvinken werkt; verwijderen en wissen niet.
  await checkboxes.nth(0).check()
  await checkboxes.nth(1).check()
  await checkboxes.nth(0).uncheck()
  await expect(page.locator('.items li').nth(1)).toHaveClass(/checked/)
  await expect(page.locator('.items li').nth(0)).not.toHaveClass(/checked/)
  await expect(page.locator('.shopping-link')).toContainText('Boodschappen (2)')
  await expect(page.locator('.items .remove').first()).toBeDisabled()
  await expect(page.locator('.clear-checked')).toBeDisabled()
  await expect(page.locator('.clear-all')).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await checkLayout(page, errors, 'boodschappen-offline')

  // Nog niets op de server, en na nog een keer herladen staan de vinkjes er nog.
  expect(patches).toEqual([])
  expect(await checkedInDatabase()).toEqual({ bloem: false, melk: false, 'wc-papier': false })
  await page.reload()
  await expect(checkboxes).toHaveCount(3)
  await expect(checkboxes.nth(1)).toBeChecked()
  await expect(checkboxes.nth(0)).not.toBeChecked()

  // Weer online: de wachtrij gaat naar de server, samengevoegd per regel.
  await context.setOffline(false)
  await expect.poll(checkedInDatabase).toEqual({ bloem: false, melk: true, 'wc-papier': false })
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  await expect(page.locator('.clear-all')).toBeEnabled()
  // Twee requests, niet drie: melk aan, en voor bloem alleen de laatste stand (uit).
  expect(patches).toEqual([{ checked: true }, { checked: false }])
  await checkLayout(page, errors, 'boodschappen-weer-online')

  await context.close()
})
