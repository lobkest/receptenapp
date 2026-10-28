import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors } from './helpers.js'

// Categorieën: kiezen in het formulier (ook een nieuwe), secties op het receptentabblad,
// filteren met de chips, en een bestaand recept zonder categorie dat onder "Overig" staat
// en via bewerken een categorie krijgt. De startcategorieën (Ontbijt, Lunch, Diner,
// Snacks) komen uit db/seeds.rb, zie playwright.config.js. Screenshots in e2e/screenshots/.

let api

function recipeData(title, { categoryName, tagNames = [] } = {}) {
  const recipe = {
    title,
    servings: 2,
    tag_names: tagNames,
    steps_attributes: [{ body: 'Alles klaarmaken.' }],
    recipe_ingredients_attributes: [{ ingredient_name: 'havermout', quantity: 50, unit: 'g' }],
  }
  if (categoryName !== undefined) recipe.category_name = categoryName
  return { recipe }
}

async function createRecipe(title, options) {
  const created = await api.post('/api/recipes', { data: recipeData(title, options) })
  expect(created.status(), await created.text()).toBe(201)
  return created.json()
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  await createRecipe('Havermout met appel', { categoryName: 'Ontbijt', tagNames: ['vega'] })
  await createRecipe('Spek met ei', { categoryName: 'ontbijt' })
  await createRecipe('Lasagne', { categoryName: 'Diner', tagNames: ['vega'] })
})

test.afterAll(async () => {
  await api.dispose()
})

const sectionTitles = (page) => page.locator('.category-section h2')
const section = (page, name) =>
  page.locator('.category-section', {
    has: page.getByRole('heading', { level: 2, name, exact: true }),
  })
const categoryChip = (page, name) =>
  page.locator('.category-chips').getByRole('button', { name, exact: true })

const categoryButtons = (page) =>
  page.getByRole('group', { name: 'Categorie', exact: true }).getByRole('button')
const categoryButton = (page, name) =>
  page
    .getByRole('group', { name: 'Categorie', exact: true })
    .getByRole('button', { name, exact: true })

test('nieuw recept met een nieuwe categorie komt in de juiste sectie, achteraan', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')

  // Vier kleine knoppen (de standaardcategorieën) en "+", samen op één regel.
  await expect(categoryButtons(page)).toHaveText(['Ontbijt', 'Lunch', 'Diner', 'Snacks', '+'])
  const boxes = await Promise.all((await categoryButtons(page).all()).map((b) => b.boundingBox()))
  expect(new Set(boxes.map((box) => Math.round(box.y))).size, 'één regel').toBe(1)
  expect(boxes.at(-1).x + boxes.at(-1).width, 'past op het scherm').toBeLessThanOrEqual(
    page.viewportSize().width,
  )
  for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(40)

  await page.getByLabel('Titel').fill('Gegrilde groenten')
  await categoryButton(page, 'Diner').click()
  await expect(categoryButton(page, 'Diner')).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: 'e2e/screenshots/recept-toevoegen-categorie-knop.png',
    animations: 'disabled',
  })

  // Toch een nieuwe: "+". Er zijn nog geen andere categorieën, dus meteen het tekstveld.
  await categoryButton(page, 'Andere of nieuwe categorie').click()
  const newCategory = page.getByLabel('Nieuwe categorie', { exact: true })
  await expect(newCategory).toBeFocused()
  await newCategory.fill('Bijgerecht')
  await expect(categoryButton(page, 'Diner')).toHaveAttribute('aria-pressed', 'false')
  await expect(categoryButton(page, 'Andere categorie: Bijgerecht')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByLabel('Naam ingrediënt 1').fill('courgette')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('1')
  await page.getByLabel('Eenheid ingrediënt 1').selectOption('stuks')
  await page.getByRole('button', { name: '+ ingrediënt' }).click()
  await page.getByLabel('Naam ingrediënt 2').fill('olijfolie')
  await page.getByLabel('Stap 1', { exact: true }).fill('Grillen.')

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: 'e2e/screenshots/recept-toevoegen-categorie-nieuw.png',
    animations: 'disabled',
  })

  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recipes') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()
  const created = await response
  expect(created.status()).toBe(201)
  expect((await created.json()).category).toMatchObject({ name: 'Bijgerecht', position: 5 })

  // Op de receptpagina een klein label boven de titel; zonder hoeveelheid alleen de naam.
  await expect(page.getByRole('heading', { level: 1, name: 'Gegrilde groenten' })).toBeVisible()
  await expect(page.locator('.category-label')).toHaveText('Bijgerecht')
  const lines = page.locator('.ingredients li')
  await expect(lines.filter({ hasText: 'olijfolie' }).first()).toBeVisible()
  await expect(page.locator('.ingredients')).not.toContainText('naar smaak')
  await page.screenshot({
    path: 'e2e/screenshots/recept-zonder-hoeveelheid.png',
    animations: 'disabled',
  })
  expect(errors).toEqual([])

  // Bewerken: "+" staat ingedrukt met de naam, en opent de lijst met die gekozen.
  await page.getByRole('link', { name: 'Bewerken' }).click()
  const more = categoryButton(page, 'Andere categorie: Bijgerecht')
  await expect(more).toHaveText('Bijgerecht')
  await more.click()
  const other = page.getByLabel('Andere categorie')
  await expect(other.locator('option')).toHaveText([
    'Kies een categorie…',
    'Bijgerecht',
    'Nieuwe categorie…',
  ])
  await expect(other.locator('option:checked')).toHaveText('Bijgerecht')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: 'e2e/screenshots/recept-bewerken-categorie-lijst.png',
    animations: 'disabled',
  })

  // Het overzicht: de nieuwe sectie na Diner (Lunch en Snacks zijn leeg, dus weg).
  await page.goto('/')
  await expect(sectionTitles(page).first()).toBeVisible()
  const titles = await sectionTitles(page).allTextContents()
  expect(titles.slice(0, 3)).toEqual(['Ontbijt', 'Diner', 'Bijgerecht'])
  await expect(section(page, 'Bijgerecht').locator('.title')).toHaveText(['Gegrilde groenten'])
  await expect(section(page, 'Ontbijt').locator('.title')).toHaveText([
    'Spek met ei',
    'Havermout met appel',
  ])
})

test('een bestaand recept zonder categorie staat onder "Overig", en krijgt er via bewerken een', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const { id } = await createRecipe('Oude stamppot')

  await page.goto('/')
  await expect(sectionTitles(page).last()).toHaveText('Overig')
  await expect(
    section(page, 'Overig').locator('.title', { hasText: 'Oude stamppot' }),
  ).toBeVisible()
  await expect(categoryChip(page, 'Alles')).toHaveAttribute('aria-pressed', 'true')
  await checkLayout(page, errors, 'recepten-categorieen', { scrollTop: true })

  // Indelen: bewerken en Lunch kiezen.
  await page.goto(`/recepten/${id}/bewerken`)
  await expect(page.getByRole('group', { name: 'Categorie', exact: true })).toBeVisible()
  await expect(categoryButtons(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(0)
  await categoryButton(page, 'Lunch').click()
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.locator('.category-label')).toHaveText('Lunch')

  await page.goto('/')
  await expect(section(page, 'Lunch').locator('.title')).toHaveText(['Oude stamppot'])
  await expect(section(page, 'Overig').locator('.title', { hasText: 'Oude stamppot' })).toHaveCount(
    0,
  )
  expect(errors).toEqual([])
})

test('chips: één categorie tegelijk, samen met de tags', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')

  // De chips scrollen binnen hun eigen rij; de pagina zelf niet (checkLayout).
  await categoryChip(page, 'Ontbijt').click()
  await expect(page).toHaveURL(/category=\d+/)
  await expect(categoryChip(page, 'Ontbijt')).toHaveAttribute('aria-pressed', 'true')
  await expect(categoryChip(page, 'Alles')).toHaveAttribute('aria-pressed', 'false')
  await expect(sectionTitles(page)).toHaveText(['Ontbijt'])
  await expect(page.locator('.recipe-grid .title')).toHaveText([
    'Spek met ei',
    'Havermout met appel',
  ])
  await checkLayout(page, errors, 'recepten-categorie-ontbijt', { scrollTop: true })

  // Plus de tag vega: alleen wat aan allebei voldoet.
  await page
    .locator('.tag-chips')
    .getByRole('button', { name: /^vega\b/ })
    .click()
  await expect(page).toHaveURL(/tags=vega/)
  await expect(page.locator('.recipe-grid .title')).toHaveText(['Havermout met appel'])

  // Andere categorie: de vorige gaat uit, de tag blijft.
  await categoryChip(page, 'Diner').click()
  await expect(categoryChip(page, 'Ontbijt')).toHaveAttribute('aria-pressed', 'false')
  await expect(sectionTitles(page)).toHaveText(['Diner'])
  await expect(page.locator('.recipe-grid .title')).toHaveText(['Lasagne'])

  // Een lege categorie meldt dat er niets is.
  await categoryChip(page, 'Snacks').click()
  await expect(page.getByText('Geen recepten in Snacks met vega')).toBeVisible()

  // "Alles" met vega: secties onder elkaar, alleen met vega-recepten.
  await categoryChip(page, 'Alles').click()
  await expect(page).not.toHaveURL(/category=/)
  await expect(section(page, 'Ontbijt').locator('.title')).toHaveText(['Havermout met appel'])
  await expect(section(page, 'Diner').locator('.title')).toHaveText(['Lasagne'])
  expect(errors).toEqual([])
})
