import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, postRecipe } from './helpers.js'
import { deleteRecipe } from './traits.js'

// De terugknop op de receptpagina (iPhone-scherm): filter aanzetten, recept openen,
// "← Recepten" en het filter staat nog aan. Ook de menulink houdt het filter, en na bewerken
// gaat browser-terug niet naar het formulier. Screenshot in e2e/screenshots/.

let api
let recipe

const TAG = 'terugtest'

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  recipe = await postRecipe(api, {
    title: 'Terugknopsoep',
    servings: 2,
    tag_names: [TAG],
    steps_attributes: [{ body: 'Alles koken.' }],
    recipe_ingredients_attributes: [{ ingredient_name: 'tomaat', quantity: 2, unit: 'stuks' }],
  })
})

test.afterAll(async () => {
  await deleteRecipe(api, recipe.id)
  await api.dispose()
})

const tagChip = (page) =>
  page.getByRole('group', { name: 'Filter op tag' }).getByRole('button', { name: TAG })

test('filter aan → recept → terug: het filter staat nog aan', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await tagChip(page).click()
  await expect(tagChip(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(new RegExp(`tags=${TAG}`))

  await page.locator('a.recipe-card', { hasText: recipe.title }).click()
  const back = page.locator('a.back-top')
  await expect(back).toHaveText('← Recepten')
  await checkLayout(page, errors, 'recept-terugknop')

  await back.click()
  await expect(page).toHaveURL(new RegExp(`/\\?tags=${TAG}$`))
  await expect(tagChip(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('a.recipe-card', { hasText: recipe.title })).toBeVisible()
})

test('menulink Recepten houdt het filter en blijft actief', async ({ page }) => {
  await page.goto(`/?tags=${TAG}`)
  await page.locator('a.recipe-card', { hasText: recipe.title }).click()
  await expect(page.locator('a.back-top')).toBeVisible()

  const menuLink = page.getByRole('navigation', { name: 'Hoofdmenu' }).locator('a.nav-link').first()
  await menuLink.click()
  await expect(page).toHaveURL(new RegExp(`/\\?tags=${TAG}$`))
  await expect(menuLink).toHaveAttribute('aria-current', 'page')
  await expect(tagChip(page)).toHaveAttribute('aria-pressed', 'true')
})

test('vanaf In huis: "← In huis"; directe link: "← Recepten" naar het overzicht', async ({
  page,
}) => {
  await page.goto(`/recepten/${recipe.id}`)
  await expect(page.locator('a.back-top')).toHaveText('← Recepten')
  await page.locator('a.back-top').click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/in-huis')
  await page.evaluate((id) => {
    history.pushState({}, '', `/recepten/${id}`)
    dispatchEvent(new PopStateEvent('popstate'))
  }, recipe.id)
  await expect(page.locator('a.back-top')).toHaveText('← In huis')
  await page.locator('a.back-top').click()
  await expect(page).toHaveURL(/\/in-huis$/)
})

test('na opslaan van bewerken gaat browser-terug niet naar het formulier', async ({ page }) => {
  await page.goto(`/?tags=${TAG}`)
  await page.locator('a.recipe-card', { hasText: recipe.title }).click()
  await page.locator('.recipe-actions a.edit').click()
  await page.getByRole('button', { name: /opslaan/i }).click()
  await expect(page).toHaveURL(new RegExp(`/recepten/${recipe.id}$`))

  // Geschiedenis: lijst → recept → (formulier, vervangen door) recept. Terug: het recept
  // van vóór het bewerken, niet het formulier.
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/recepten/${recipe.id}$`))
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/\\?tags=${TAG}$`))
})
