import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import {
  checkLayout,
  collectErrors,
  countValue,
  openShoppingList,
  shoppingList,
  shoppingRow,
} from './helpers.js'

// Het aantal op de boodschappenlijst: [− n +] naast elke regel; aanpassen met − en +.
// Na herladen staat het aantal er nog (het staat op de server). Bij een hoeveelheid
// vermenigvuldigt het: "200 g yoghurt (×2)". Screenshots in e2e/screenshots/.

let api

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
})

test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const response = await api.post('/api/shopping_list_items', {
    data: {
      shopping_list_items: [
        { name: 'eieren', source_label: 'standaard' },
        { name: 'yoghurt', quantity: 100, unit: 'g', source_label: 'Muesli' },
      ],
    },
  })
  expect(response.status(), await response.text()).toBe(201)
})

test.afterAll(async () => {
  await api.dispose()
})

// Het aantal van een regel op de server.
async function countOnServer(name) {
  return (await shoppingList(api)).find((item) => item.name === name)?.count
}

// Telt de PATCH-requests van de pagina.
function countPatches(page) {
  const patches = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH') patches.push(request.postDataJSON())
  })
  return patches
}

function stepButton(page, name, direction) {
  return page.getByRole('button', { name: `Eén ${name} ${direction}` })
}

test('verhogen en verlagen: meteen zichtbaar, één PATCH na snel tikken, en bewaard na herladen', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const patches = countPatches(page)
  await openShoppingList(page)

  await expect(countValue(page, 'eieren')).toHaveText('1')
  await expect(stepButton(page, 'eieren', 'minder')).toBeDisabled()

  // Drie keer snel achter elkaar: het getal loopt meteen op, de server krijgt één PATCH.
  for (let i = 0; i < 3; i++) await stepButton(page, 'eieren', 'meer').tap()
  await expect(countValue(page, 'eieren')).toHaveText('4')
  await expect.poll(() => countOnServer('eieren')).toBe(4)
  expect(patches).toEqual([{ shopping_list_item: { count: 4 } }])

  await stepButton(page, 'eieren', 'minder').tap()
  await expect(countValue(page, 'eieren')).toHaveText('3')
  await expect.poll(() => countOnServer('eieren')).toBe(3)

  // Twee keer snel op + (een dubbeltik) telt twee keer en zoomt niet in.
  await stepButton(page, 'eieren', 'meer').tap()
  await stepButton(page, 'eieren', 'meer').tap()
  await expect(countValue(page, 'eieren')).toHaveText('5')
  expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1)
  await expect.poll(() => countOnServer('eieren')).toBe(5)

  await page.reload()
  await expect(countValue(page, 'eieren')).toHaveText('5')
  await expect(shoppingRow(page, 'eieren').locator('.line')).toHaveText('eieren')
  expect(errors).toEqual([])
})

test('een regel met hoeveelheid: "200 g yoghurt (×2)", ook na herladen', async ({ page }) => {
  const errors = collectErrors(page)
  await openShoppingList(page)
  await expect(shoppingRow(page, 'yoghurt').locator('.line')).toHaveText('100 g yoghurt')

  await stepButton(page, 'yoghurt', 'meer').tap()
  await expect(shoppingRow(page, 'yoghurt').locator('.line')).toHaveText('200 g yoghurt (×2)')
  await expect.poll(() => countOnServer('yoghurt')).toBe(2)

  await page.reload()
  await expect(shoppingRow(page, 'yoghurt').locator('.line')).toHaveText('200 g yoghurt (×2)')
  await expect(countValue(page, 'yoghurt')).toHaveText('2')
  // De hoeveelheid zelf blijft per stuk: de lijst vermenigvuldigt.
  expect((await shoppingList(api)).find((item) => item.name === 'yoghurt').quantity).toBe(100)
  expect(errors).toEqual([])
})

test('afgevinkt: de stepper staat uit, afvinken zelf werkt gewoon', async ({ page }) => {
  await openShoppingList(page)

  await shoppingRow(page, 'eieren').getByRole('checkbox').check()
  await expect(shoppingRow(page, 'eieren')).toHaveClass(/checked/)
  await expect(stepButton(page, 'eieren', 'meer')).toBeDisabled()
  await expect(stepButton(page, 'eieren', 'minder')).toBeDisabled()
  await expect(shoppingRow(page, 'eieren').locator('.stepper')).toHaveClass(/disabled/)
})

test('screenshots op een iPhone: knoppen minstens 44×44, een regel met en zonder hoeveelheid', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await api.patch(
    `/api/shopping_list_items/${(await shoppingList(api)).find((item) => item.name === 'yoghurt').id}`,
    { data: { shopping_list_item: { count: 2 } } },
  )
  await openShoppingList(page)
  await expect(shoppingRow(page, 'yoghurt').locator('.line')).toHaveText('200 g yoghurt (×2)')

  for (const name of ['eieren', 'yoghurt']) {
    const row = shoppingRow(page, name)
    for (const control of await row.locator('.stepper button, .remove').all()) {
      const box = await control.boundingBox()
      expect(box.width, `${name}: breedte`).toBeGreaterThanOrEqual(44)
      expect(box.height, `${name}: hoogte`).toBeGreaterThanOrEqual(44)
    }
    // Alles op één regel: de stepper staat naast de tekst, niet eronder.
    expect((await row.boundingBox()).height).toBeLessThan(50)
  }

  await shoppingRow(page, 'eieren').screenshot({
    path: 'e2e/screenshots/boodschappen-aantal-zonder-hoeveelheid.png',
    animations: 'disabled',
  })
  await shoppingRow(page, 'yoghurt').screenshot({
    path: 'e2e/screenshots/boodschappen-aantal-met-hoeveelheid.png',
    animations: 'disabled',
  })
  await checkLayout(page, errors, 'boodschappen-aantal')
})

test('lange naam: loopt door over meerdere regels, krijgt de meeste ruimte, knoppen overlappen niet', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const name = 'biologische halfvolle yoghurt met extra veel griekse stijl en vanille'
  expect(
    (
      await api.post('/api/shopping_list_items', { data: { shopping_list_items: [{ name }] } })
    ).status(),
  ).toBe(201)
  await openShoppingList(page)

  const row = shoppingRow(page, 'griekse stijl')
  const line = await row.locator('.line').boundingBox()
  const rowBox = await row.boundingBox()
  // Doorlopen, niet afkappen: meerdere regels hoog en geen ellipsis.
  expect(line.height).toBeGreaterThan(40)
  expect(await row.locator('.line').evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe(
    'ellipsis',
  )
  // De naam krijgt meer dan 40% van de regel (vóór de compacte stepper was het ~34%).
  expect(line.width / rowBox.width).toBeGreaterThan(0.4)

  // Van links naar rechts: naam, −, +, ✕, zonder overlap.
  const boxes = []
  for (const control of [
    row.locator('.line'),
    stepButton(page, name, 'minder'),
    stepButton(page, name, 'meer'),
    row.locator('.remove'),
  ]) {
    boxes.push(await control.boundingBox())
  }
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 0.5)
  }

  await row.screenshot({
    path: 'e2e/screenshots/boodschappen-aantal-lange-naam.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])
})
