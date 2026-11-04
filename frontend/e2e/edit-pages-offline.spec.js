import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL, useOwnIp } from './env.js'
import { checkLayout, collectErrors, ingredientId, iphone, postRecipe } from './helpers.js'

// Recept bewerken, Ingrediënt bewerken en Beheer > versies zonder verbinding: dezelfde
// offline-melding bovenaan als op elke pagina, het formulier blijft staan met wat je
// invulde, en opslaan staat uit. Op een iPhone-scherm (gebouwde app); screenshots in
// e2e/screenshots/offline-bewerken-*.png.

const TITLE = 'Offline: geen verbinding met de server'
const EDITING = 'opslaan kan weer zodra er verbinding is'
const RECIPE = {
  title: 'Bewerk-offline-pannenkoeken',
  servings: 2,
  steps_attributes: [{ body: 'Bakken.' }],
  recipe_ingredients_attributes: [{ ingredient_name: 'bloem', quantity: 250, unit: 'g' }],
}

let api
let recipe

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  recipe = await postRecipe(api, RECIPE)
  // Een tweede versie, zodat er iets terug te zetten is.
  const updated = await api.patch(`/api/recipes/${recipe.id}`, {
    data: { recipe: { lock_version: recipe.lock_version, description: 'Dun.' } },
  })
  expect(updated.status(), await updated.text()).toBe(200)
})

test.afterAll(async () => {
  await api.dispose()
})

// Online openen, iets invullen, dan valt de verbinding weg.
async function offlineAfterTyping(context, page, path, fill) {
  await page.goto(path)
  await fill()
  await context.setOffline(true)
  const notice = page.locator('main .offline-notice')
  await expect(notice).toHaveCount(1)
  await expect(notice.locator('.offline-title')).toHaveText(TITLE)
  await expect(notice.locator('.offline-detail')).toHaveText(EDITING)
  return notice
}

// De melding staat bovenaan: niets in main erboven.
async function expectNoticeOnTop(page) {
  const top = await page.evaluate(() => {
    const main = document.querySelector('main').getBoundingClientRect()
    return Math.round(
      document.querySelector('main .offline-notice').getBoundingClientRect().top - main.top,
    )
  })
  expect(top).toBeLessThanOrEqual(16)
}

test('Recept bewerken offline: melding, invoer blijft, opslaan uit', async ({ browser }) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  const title = page.getByLabel('Titel')

  await offlineAfterTyping(context, page, `/recepten/${recipe.id}/bewerken`, async () => {
    await expect(title).toHaveValue(RECIPE.title)
    await title.fill('Dunne pannenkoeken')
  })

  await expectNoticeOnTop(page)
  await expect(title).toHaveValue('Dunne pannenkoeken')
  const save = page.getByRole('button', { name: 'Opslaan' })
  await expect(save).toBeDisabled()
  await expect(page.locator('.submit-bar .offline-hint')).toBeVisible()
  await checkLayout(page, errors, 'offline-bewerken-recept', { scrollTop: true })

  // Verbinding terug: opslaan kan weer, en de invoer is er nog.
  await context.setOffline(false)
  await expect(page.locator('main .offline-notice')).toHaveCount(0)
  await expect(save).toBeEnabled()
  await expect(title).toHaveValue('Dunne pannenkoeken')
  await context.close()
})

test('Ingrediënt bewerken offline: melding, invoer blijft, opslaan uit', async ({ browser }) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  const grams = page.getByLabel('Gram per stuk')

  await offlineAfterTyping(
    context,
    page,
    `/ingredienten/${await ingredientId(api, 'bloem')}`,
    async () => {
      await expect(page.locator('h1')).toHaveText('bloem')
      await grams.fill('12')
    },
  )

  await expectNoticeOnTop(page)
  await expect(grams).toHaveValue('12')
  await expect(page.getByRole('button', { name: 'Opslaan' })).toBeDisabled()
  await expect(page.locator('#staple')).toBeDisabled()
  await checkLayout(page, errors, 'offline-bewerken-ingredient', { scrollTop: true })
  await context.close()
})

test('Beheer > versies offline: melding, versies blijven, terugzetten uit', async ({ browser }) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await useOwnIp(page, 41)
  await page.addInitScript((code) => sessionStorage.setItem('adminCode', code), ADMIN_TOKEN)

  await offlineAfterTyping(context, page, `/beheer/recepten/${recipe.id}/versies`, async () => {
    await expect(page.locator('.versions li').first()).toBeVisible()
  })

  await expectNoticeOnTop(page)
  await expect(page.locator('.versions li .summary').first()).toBeVisible()
  const restore = page.getByRole('button', { name: 'Deze versie terugzetten' })
  expect(await restore.count()).toBeGreaterThan(0)
  for (const button of await restore.all()) await expect(button).toBeDisabled()
  await checkLayout(page, errors, 'offline-bewerken-versies', { scrollTop: true })
  await context.close()
})
