import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL, useOwnIp } from './env.js'
import { giveTraits } from './traits.js'

// Variaties op een recept, op een iPhone-scherm: toevoegen op de receptpagina, de kaart,
// het recept bewerken (de variatie blijft kloppen), "Variatie op lijst", een
// verwijderverzoek en terugzetten door de beheerder. Screenshots in e2e/screenshots/.

let api
let recipeId

const CURRY = {
  title: 'Tofucurry',
  description: 'Snelle curry met rijst.',
  servings: 2,
  tag_names: ['vega', 'snel'],
  steps_attributes: [{ body: 'Rijst koken.' }, { body: 'Tofu bakken, ui erbij, curry erdoor.' }],
  recipe_ingredients_attributes: [
    { ingredient_name: 'tofu', quantity: 200, unit: 'g' },
    { ingredient_name: 'rijst', quantity: 150, unit: 'g' },
    { ingredient_name: 'ui', quantity: 1, unit: 'stuks' },
    { ingredient_name: 'koriander', quantity: 5, unit: 'g', optional: true },
  ],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  // Kip en garnalen komen er in variaties bij; met hun kenmerken verliezen die variaties
  // de automatische tags vegetarisch en veganistisch. De curry zelf (tofu, rijst, ui,
  // koriander) heeft geen kenmerken en is dus alle vier.
  await giveTraits(api, 'kip', ['vlees', 'dierlijk'])
  await giveTraits(api, 'garnalen', ['vis', 'dierlijk'])
  const created = await api.post('/api/recipes', { data: { recipe: CURRY } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
})

// De boodschappenlijst is één gedeelde lijst: elke test begint leeg.
test.beforeEach(async () => {
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
})

test.afterAll(async () => {
  await api.dispose()
})

function collectErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

// Niets breder dan het scherm, geen console-errors; met een naam ook een screenshot.
async function checkLayout(page, errors, name = null) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  if (name) {
    await page.screenshot({
      path: `e2e/screenshots/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  expect(errors, 'geen console-errors').toEqual([])
}

function card(page, name) {
  return page.locator('.variation-card', { has: page.getByRole('heading', { name, exact: true }) })
}

test('variatie toevoegen, recept bewerken, op lijst, verwijderen en terugzetten', async ({
  page,
}) => {
  const errors = collectErrors(page)

  // ---- De receptpagina: tags onder de titel (eerst de automatische), nog geen variaties.
  await page.goto(`/recepten/${recipeId}`)
  await expect(page.locator('.recipe-tags .tag')).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'veganistisch',
    'vegetarisch',
    'snel',
    'vega',
  ])
  // Glutenvrij en lactosevrij komen uit onze eigen gegevens: een kanttekening.
  await expect(page.locator('.tag-disclaimer')).toHaveText(
    'Op basis van eigen ingrediëntgegevens; controleer etiketten.',
  )
  await expect(page.locator('section.variations')).toContainText('Nog geen variaties.')

  // ---- Toevoegen: − tofu, + 150 g kip, tag vega eraf, een notitie.
  await page.getByRole('button', { name: 'Voeg variatie toe' }).click()
  const form = page.locator('form.variation-form')
  await form.getByLabel('Naam variatie').fill('Met kip')
  await form.getByLabel('Notities').fill('Kip in blokjes, eerst aanbakken.')
  await form
    .getByRole('group', { name: '− ingrediënt' })
    .getByRole('checkbox', { name: /^tofu/ })
    .check()
  await form.getByLabel('Naam extra ingrediënt 1').fill('kip')
  await form.getByLabel('Hoeveelheid extra ingrediënt 1').fill('150')
  await form.getByLabel('Eenheid extra ingrediënt 1').selectOption('g')
  await form
    .getByRole('group', { name: 'Tag eraf' })
    .getByRole('checkbox', { name: 'vega' })
    .check()
  await form.scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'variatie-formulier')
  await form.getByRole('button', { name: 'Variatie toevoegen' }).click()

  // ---- De kaart: rood doorgestreept eraf, groen erbij, tag met teken.
  const chicken = card(page, 'Met kip')
  await expect(page.locator('section.variations [role="status"]')).toHaveText(
    '"Met kip" is toegevoegd.',
  )
  await expect(chicken.locator('.change')).toHaveText(['− tofu', '+ 150 g kip'])
  await expect(chicken.locator('.notes')).toHaveText('Kip in blokjes, eerst aanbakken.')
  // vega haalde iemand er zelf af; vegetarisch en veganistisch gaan eraf door de kip.
  await expect(chicken.locator('.tag-change')).toHaveText(['− vega', '− veganistisch', '− vegetarisch'])
  const removed = chicken.locator('.change.removed')
  expect(await removed.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(140, 29, 23)')
  expect(await removed.locator('s').evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe(
    'line-through',
  )
  expect(await chicken.locator('.change.added').evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(30, 90, 45)',
  )
  await checkLayout(page, errors)

  // ---- Het recept bewerken: rijst 150 → 200 g. De variatie wijst nog naar de tofu.
  await page.locator('.recipe-actions').getByRole('link', { name: 'Bewerken' }).click()
  await expect(page.getByRole('heading', { name: 'Recept bewerken' })).toBeVisible()
  await page.getByLabel('Hoeveelheid ingrediënt 2').fill('200')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('status').first()).toHaveText('"Tofucurry" is opgeslagen.')
  await expect(chicken.locator('.change')).toHaveText(['− tofu', '+ 150 g kip'])

  // ---- Variatie op lijst, voor 4 porties: alles × 2, zonder tofu en koriander (optioneel).
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(chicken.locator('.change.added')).toHaveText('+ 300 g kip')
  await chicken.getByRole('button', { name: 'Variatie op lijst' }).click()
  await expect(page.locator('section.variations [role="status"]')).toHaveText(
    '"Met kip" staat op je boodschappenlijst.',
  )

  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toHaveText(['400 g rijst', '2 stuks ui', '300 g kip'])
  await expect(page.locator('.items .sources').first()).toHaveText(
    'uit: Tofucurry (variatie: Met kip)',
  )
  await checkLayout(page, errors, 'variatie-boodschappen')

  // ---- Verwijderen: een verzoek met reden; de kaart verdwijnt.
  await page.goto(`/recepten/${recipeId}`)
  await card(page, 'Met kip').getByRole('button', { name: 'Verwijderen' }).click()
  const dialog = page.getByRole('dialog', { name: '"Met kip" verwijderen?' })
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused()
  await dialog.getByLabel('Reden (optioneel)').fill('Test')
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page.locator('section.variations [role="status"]')).toHaveText(
    '"Met kip" is verwijderd.',
  )
  await expect(page.locator('.variation-card')).toHaveCount(0)

  // ---- Beheer: het verzoek staat erbij als variatie; terugzetten maakt het weer zichtbaar.
  await useOwnIp(page, 11)
  await page.addInitScript((code) => sessionStorage.setItem('adminCode', code), ADMIN_TOKEN)
  await page.goto('/beheer')
  const request = page.locator('.requests li.variation', { hasText: 'Met kip' })
  await expect(request.locator('.kind')).toHaveText('Variatie op Tofucurry')
  await expect(request).toContainText('Reden: Test')
  await checkLayout(page, errors, 'beheer-variatie')
  await request.getByRole('button', { name: 'Terugzetten' }).click()
  await expect(page.getByRole('status')).toHaveText(
    '"Met kip" (variatie op Tofucurry) is teruggezet en weer zichtbaar.',
  )

  await page.goto(`/recepten/${recipeId}`)
  await expect(card(page, 'Met kip').locator('.change')).toHaveText(['− tofu', '+ 150 g kip'])
})

// Het basisrecept op de lijst, voor 3 porties (× 1,5), na de eerste test (rijst 200 g). Deze uitkomsten zijn vastgelegd
// vóór de server het rekenwerk overnam; ze moeten precies zo blijven.
test('recept op lijst: alles en los, geschaald', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeId}`)
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(page.locator('.servings-count')).toHaveText('3 porties')

  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await expect(page.locator('.ingredients [role="status"]')).toHaveText(
    'Alle ingrediënten staan op je boodschappenlijst, behalve de optionele.',
  )
  // Los: ook een optioneel ingrediënt.
  await page.getByRole('button', { name: 'koriander op boodschappenlijst' }).click()
  await expect(page.locator('.ingredients [role="status"]')).toHaveText(
    'koriander staat op je boodschappenlijst.',
  )
  await checkLayout(page, errors, 'recept-op-lijst-knoppen')

  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toHaveText([
    '300 g tofu',
    '300 g rijst', // 200 g sinds de eerste test, × 1,5
    '1,5 stuks ui',
    '7,5 g koriander',
  ])
  await expect(page.locator('.items .sources')).toHaveText(Array(4).fill('uit: Tofucurry'))
  await checkLayout(page, errors, 'recept-op-lijst')
})

test('receptpagina met drie variaties: twee kolommen, de derde op een nieuwe rij', async ({
  page,
}) => {
  const recipe = await (await api.get(`/api/recipes/${recipeId}`)).json()
  const tofu = recipe.ingredients.find((row) => row.name === 'tofu')
  for (const variation of [
    {
      name: 'Met garnalen',
      removed_ingredient_ids: [tofu.id],
      added_ingredients: [{ name: 'garnalen', quantity: 200, unit: 'g' }],
      removed_tag_names: ['vega'],
      added_tag_names: ['vis'],
    },
    {
      name: 'Extra pittig en een heel lange naam zonderspatiesdienietpast',
      notes: 'Sambal naar smaak, en een rode peper door de ui.',
      added_ingredients: [
        { name: 'sambal', quantity: null, unit: null },
        { name: 'rode peper', quantity: 1, unit: 'stuks' },
      ],
    },
  ]) {
    const created = await api.post(`/api/recipes/${recipeId}/variations`, { data: { variation } })
    expect(created.status(), await created.text()).toBe(201)
  }
  const errors = collectErrors(page)

  await page.goto(`/recepten/${recipeId}`)
  const cards = page.locator('.variation-grid .variation-card')
  await expect(cards).toHaveCount(3)
  const columns = await page
    .locator('.variation-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)
  const [first, second, third] = await cards.evaluateAll((all) =>
    all.map((el) => el.getBoundingClientRect().top),
  )
  expect(second).toBe(first)
  expect(third).toBeGreaterThan(first)
  // + vis en − vega zijn zelf gekozen; de garnalen (vis, dierlijk) halen de automatische eraf.
  await expect(card(page, 'Met garnalen').locator('.tag-change')).toHaveText([
    '+ vis',
    '− vega',
    '− veganistisch',
    '− vegetarisch',
  ])

  await page.locator('section.variations').scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'recept-variaties')
})
