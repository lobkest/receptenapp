import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL, useOwnIp } from './env.js'
import { checkLayout, collectErrors, ingredientId } from './helpers.js'

// Dubbele ingrediënten: "Bedoel je: …?" in het receptformulier, en samenvoegen op het
// bewerkscherm met de beheercode. Screenshots in e2e/screenshots/.

let api

async function createRecipe(title, ingredientName) {
  const created = await api.post('/api/recipes', {
    data: {
      recipe: {
        title,
        servings: 2,
        steps_attributes: [{ body: 'Alles bakken.' }],
        recipe_ingredients_attributes: [
          { ingredient_name: ingredientName, quantity: 2, unit: 'stuks' },
        ],
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  return created.json()
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  await createRecipe('Samenvoegtest ovenschotel', 'zoete aardappel')
  await createRecipe('Samenvoegtest salade', 'trostomaten')
  await createRecipe('Samenvoegtest bruschetta', 'trostomaat')
})

test.afterAll(async () => {
  await api.dispose()
})

test('receptformulier: "Bedoel je" bij een bijna-dubbele naam, tikken neemt hem over', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')

  const name = page.getByLabel('Naam ingrediënt 1')
  await name.fill('Zoete aardappelen')
  const suggestion = page.locator('.ingredient-suggestion')
  await expect(suggestion).toHaveText('Bedoel je: zoete aardappel?')
  await name.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -120))
  await checkLayout(page, errors, 'bijna-dubbel-suggestie', { fullPage: false })

  await suggestion.getByRole('button', { name: 'zoete aardappel' }).click()
  await expect(name).toHaveValue('zoete aardappel')
  await expect(suggestion).toHaveCount(0)
})

test('samenvoegen: kiezen, beheercode in het venster, daarna op het doel', async ({ page }) => {
  await useOwnIp(page, 30)
  const errors = collectErrors(page)
  const sourceId = await ingredientId(api, 'trostomaten')
  const targetId = await ingredientId(api, 'trostomaat')
  await page.goto(`/ingredienten/${sourceId}`)

  await page.getByRole('button', { name: 'Samenvoegen met…' }).click()
  await page.getByLabel('Samenvoegen met', { exact: true }).fill('trostomaat')
  await page.getByRole('button', { name: 'Samenvoegen met trostomaat', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toHaveText(
    '"trostomaten" samenvoegen met "trostomaat"?',
  )
  await dialog.getByLabel('Beheercode').fill(ADMIN_TOKEN)
  await checkLayout(page, errors, 'samenvoegen-dialoog', { fullPage: false })

  await dialog.getByRole('button', { name: 'Samenvoegen' }).click()
  await expect(page).toHaveURL(`/ingredienten/${targetId}`)
  await expect(page.getByRole('status')).toHaveText(
    '"trostomaten" is samengevoegd met "trostomaat".',
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await checkLayout(page, errors, 'samenvoegen-klaar', { fullPage: false })

  expect(await ingredientId(api, 'trostomaten')).toBeUndefined()
  const recipes = await (await api.get('/api/recipes')).json()
  const salade = recipes.find((recipe) => recipe.title === 'Samenvoegtest salade')
  const detail = await (await api.get(`/api/recipes/${salade.id}`)).json()
  expect(detail.ingredients.map((row) => row.name)).toEqual(['trostomaat'])
})
