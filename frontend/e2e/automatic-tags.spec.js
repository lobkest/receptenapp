import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { giveTraits } from './traits.js'

// Automatische tags op een iPhone-scherm: uitgerekend uit de kenmerken van de ingrediënten.
// Kip (vlees, dierlijk) met tofu als alternatief: vegetarisch "met tofu i.p.v. kip"; na de
// wissel geen hint; vlees uitvinken bij kip verandert het label. Screenshots in e2e/screenshots/.

let api
let recipeId
let kipId

const WOK = {
  title: 'Kipwok met rijst',
  servings: 2,
  steps_attributes: [{ body: 'Kip bakken, rijst koken, alles mengen.' }],
  recipe_ingredients_attributes: [
    {
      ingredient_name: 'kip',
      quantity: 250,
      unit: 'g',
      alternatives_attributes: [{ ingredient_name: 'tofu' }],
    },
    { ingredient_name: 'rijst', quantity: 150, unit: 'g' },
  ],
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  kipId = await giveTraits(api, 'kip', ['vlees', 'dierlijk'])
  const created = await api.post('/api/recipes', { data: { recipe: WOK } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
})

// Kip weer zoals hij hoort, voor de specs hierna.
test.afterAll(async () => {
  await giveTraits(api, 'kip', ['vlees', 'dierlijk'])
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
async function checkLayout(page, errors, name = null, { fullPage = true } = {}) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  if (name) {
    await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage, animations: 'disabled' })
  }
  expect(errors, 'geen console-errors').toEqual([])
}

function recipeTags(page) {
  return page.locator('.recipe-tags .tag')
}

test('receptkaart en receptpagina: hint, wissel en disclaimer', async ({ page }) => {
  const errors = collectErrors(page)

  // ---- De kaart: automatische tags eerst; veganistisch en vegetarisch alleen met tofu.
  await page.goto('/?tags=vegetarisch')
  const card = page.locator('.recipe-card', { hasText: WOK.title })
  await expect(card.locator('.tag')).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'veganistischmet tofu i.p.v. kip',
    '+1',
  ])
  // De kaart blijft compact: de hint breekt niet buiten de kaart.
  const box = await card.boundingBox()
  const hint = await card.locator('.tag-hint').boundingBox()
  expect(hint.x + hint.width).toBeLessThanOrEqual(box.x + box.width)
  await checkLayout(page, errors, 'automatische-tags-kaart', { fullPage: false })

  // ---- De receptpagina: hint bij vegetarisch en veganistisch, disclaimer bij glutenvrij.
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: WOK.title })).toBeVisible()
  await expect(recipeTags(page)).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'veganistisch · met tofu i.p.v. kip',
    'vegetarisch · met tofu i.p.v. kip',
  ])
  await expect(page.locator('.tag-disclaimer')).toHaveText(
    'Op basis van eigen ingrediëntgegevens; controleer etiketten.',
  )
  await checkLayout(page, errors, 'automatische-tags-recept')

  // ---- Wisselen voor tofu: de hint verdwijnt, ook na herladen (de wissel staat in de URL).
  await page.getByRole('button', { name: 'Wissel voor tofu' }).click()
  await expect(page).toHaveURL(/wissel=/)
  await expect(recipeTags(page)).toHaveText(['glutenvrij', 'lactosevrij', 'veganistisch', 'vegetarisch'])
  await page.reload()
  await expect(recipeTags(page)).toHaveText(['glutenvrij', 'lactosevrij', 'veganistisch', 'vegetarisch'])
  await checkLayout(page, errors, 'automatische-tags-recept-gewisseld')

  // ---- Het filter laat met_wissel door, maar niet wat echt niet past.
  await page.goto('/?tags=veganistisch')
  await expect(page.locator('.recipe-card', { hasText: WOK.title })).toBeVisible()
  expect(errors).toEqual([])
})

test('vlees uitvinken bij kip op het bewerkscherm verandert het label op het recept', async ({
  page,
}) => {
  const errors = collectErrors(page)

  // ---- De ingrediëntenpagina: kenmerken per rij, filter op nog te controleren.
  await page.goto('/ingredienten?filter=kenmerken')
  const row = page.locator('.ingredient-list li', { has: page.locator('.name', { hasText: /^kip$/ }) })
  await expect(row.locator('.trait')).toHaveText(['vlees', 'dierlijk', 'kenmerken controleren'])
  await expect(page.getByRole('button', { name: /^Kenmerken te controleren/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await checkLayout(page, errors, 'ingredienten-kenmerken', { fullPage: false })

  // ---- Het bewerkscherm: vinkjes, het gevolg, meteen opgeslagen.
  await row.locator('a').click()
  await expect(page).toHaveURL(`/ingredienten/${kipId}`)
  const traits = page.getByRole('group', { name: 'Kenmerken' })
  await expect(traits.getByRole('checkbox', { name: 'vlees' })).toBeChecked()
  await expect(page.locator('.consequence')).toHaveText('→ niet vegetarisch, niet veganistisch')
  await page.locator('section.traits').scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'ingredient-kenmerken')

  await traits.getByRole('checkbox', { name: 'vlees' }).uncheck()
  await expect(page.locator('.consequence')).toHaveText('→ niet veganistisch')
  await expect(page.locator('section.traits [role="status"]')).toHaveText('Kenmerken opgeslagen.')

  // Gecontroleerd: de knop verdwijnt, de badge zegt het.
  await page.getByRole('button', { name: 'Gecontroleerd' }).click()
  await expect(page.locator('.trait-badge')).toHaveText('gecontroleerd')
  await expect(page.getByRole('button', { name: 'Gecontroleerd' })).toHaveCount(0)

  // ---- Het recept: vegetarisch zonder hint (kip is nu geen vlees), veganistisch nog wel.
  await page.goto(`/recepten/${recipeId}`)
  await expect(recipeTags(page)).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'veganistisch · met tofu i.p.v. kip',
    'vegetarisch',
  ])

  // ---- En weer aan: vegetarisch krijgt de hint terug.
  await page.goto(`/ingredienten/${kipId}`)
  await page.getByRole('group', { name: 'Kenmerken' }).getByRole('checkbox', { name: 'vlees' }).check()
  await expect(page.locator('section.traits [role="status"]')).toHaveText('Kenmerken opgeslagen.')
  await page.goto(`/recepten/${recipeId}`)
  await expect(recipeTags(page).last()).toHaveText('vegetarisch · met tofu i.p.v. kip')
  expect(errors).toEqual([])
})
