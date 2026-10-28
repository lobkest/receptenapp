import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe, giveTraits } from './traits.js'
import { checkLayout, collectErrors } from './helpers.js'

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
    'notenvrij',
    'veganistischmet tofu i.p.v. kip',
    'vegetarischmet tofu i.p.v. kip',
  ])
  // De kaart blijft compact: geen hint breekt buiten de kaart.
  const box = await card.boundingBox()
  for (const hint of await card.locator('.tag-hint').all()) {
    const hintBox = await hint.boundingBox()
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(box.x + box.width)
  }
  await checkLayout(page, errors, 'automatische-tags-kaart', { fullPage: false })

  // ---- De receptpagina: hint bij vegetarisch en veganistisch, disclaimer bij glutenvrij.
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: WOK.title })).toBeVisible()
  await expect(recipeTags(page)).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'notenvrij',
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
  await expect(recipeTags(page)).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'notenvrij',
    'veganistisch',
    'vegetarisch',
  ])
  await page.reload()
  await expect(recipeTags(page)).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'notenvrij',
    'veganistisch',
    'vegetarisch',
  ])
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
  const rowOf = (name) =>
    page.locator('.ingredient-list li', {
      has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }),
    })
  const row = rowOf('kip')
  await expect(row.locator('.trait')).toHaveText(['vlees', 'dierlijk', 'kenmerken controleren'])

  // ✓ bij rijst: gecontroleerd, en meteen weg uit dit filter, zonder herladen.
  const check = page.getByRole('button', { name: 'rijst gecontroleerd', exact: true })
  const size = await check.boundingBox()
  expect(size.width).toBeGreaterThanOrEqual(40)
  expect(size.height).toBeGreaterThanOrEqual(40)
  await check.click()
  await expect(rowOf('rijst')).toHaveCount(0)
  await page.getByRole('button', { name: /^Alle/ }).click()
  await expect(rowOf('rijst').locator('.mark-checked')).toHaveCount(0)
  await expect(rowOf('rijst').locator('.trait')).toHaveCount(0)
  await page.getByRole('button', { name: /^Kenmerken te controleren/ }).click()
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
    'notenvrij',
    'veganistisch · met tofu i.p.v. kip',
    'vegetarisch',
  ])

  // ---- En weer aan: vegetarisch krijgt de hint terug.
  await page.goto(`/ingredienten/${kipId}`)
  await page
    .getByRole('group', { name: 'Kenmerken' })
    .getByRole('checkbox', { name: 'vlees' })
    .check()
  await expect(page.locator('section.traits [role="status"]')).toHaveText('Kenmerken opgeslagen.')
  await page.goto(`/recepten/${recipeId}`)
  await expect(recipeTags(page).last()).toHaveText('vegetarisch · met tofu i.p.v. kip')
  expect(errors).toEqual([])
})

test('kaarten: een met zes tags (één met hint) naast een zonder tags', async ({ page }) => {
  // Ei is dierlijk: alleen veganistisch vraagt om de tofu. Schnitzel met kaas past bij geen
  // enkele automatische tag (vlees, gluten, lactose, en noten in de pindasaus).
  await giveTraits(api, 'ei', ['dierlijk'])
  await giveTraits(api, 'kipschnitzel', ['vlees', 'dierlijk', 'gluten'])
  await giveTraits(api, 'kaas', ['dierlijk', 'lactose'])
  await giveTraits(api, 'pindasaus', ['noten'])
  const recipe = (title, tags, rows) => ({
    title,
    servings: 2,
    category_name: 'Snacks',
    tag_names: tags,
    steps_attributes: [{ body: 'Bakken.' }],
    recipe_ingredients_attributes: rows,
  })
  // In Snacks (een standaardcategorie, verder leeg in de e2e-tests), zodat de twee kaarten
  // samen in één sectie staan. Na afloop weer weg, zodat latere specs er niets van merken.
  let categoryId
  const ids = []
  for (const data of [
    recipe(
      'Roerei met rijst',
      ['snel'],
      [
        {
          ingredient_name: 'ei',
          quantity: 4,
          unit: 'stuks',
          alternatives_attributes: [{ ingredient_name: 'tofu' }],
        },
        { ingredient_name: 'rijst', quantity: 150, unit: 'g' },
      ],
    ),
    recipe(
      'Schnitzel met kaas',
      [],
      [
        { ingredient_name: 'kipschnitzel', quantity: 2, unit: 'stuks' },
        { ingredient_name: 'kaas', quantity: 50, unit: 'g' },
        { ingredient_name: 'pindasaus', quantity: 2, unit: 'el' },
      ],
    ),
  ]) {
    const created = await api.post('/api/recipes', { data: { recipe: data } })
    expect(created.status(), await created.text()).toBe(201)
    const body = await created.json()
    categoryId = body.category.id
    ids.push(body.id)
  }
  const errors = collectErrors(page)

  await page.goto(`/?category=${categoryId}`)
  const roerei = page.locator('.recipe-card', { hasText: 'Roerei met rijst' })
  const schnitzel = page.locator('.recipe-card', { hasText: 'Schnitzel met kaas' })
  await expect(roerei.locator('.tag')).toHaveText([
    'glutenvrij',
    'lactosevrij',
    'notenvrij',
    'veganistischmet tofu i.p.v. ei',
    'vegetarisch',
    'snel',
  ])
  await expect(schnitzel.locator('.tag')).toHaveCount(0)

  // Naast elkaar, niets steekt uit, en de kaart met tags is niet absurd hoog.
  const a = await roerei.boundingBox()
  const b = await schnitzel.boundingBox()
  expect(b.y).toBe(a.y)
  expect(a.height).toBeLessThan(320)
  for (const tag of await roerei.locator('.tag').all()) {
    const box = await tag.boundingBox()
    expect(box.x + box.width).toBeLessThanOrEqual(a.x + a.width)
  }
  await checkLayout(page, errors, 'automatische-tags-kaarten', { fullPage: false })

  for (const id of ids) await deleteRecipe(api, id)
})
