import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, postRecipe } from './helpers.js'
import { deleteRecipe } from './traits.js'

// Scrollpositie bij routewissels (iPhone-scherm): een nieuwe pagina opent bovenaan, terug
// geeft de oude positie in de receptenlijst, en elk tabblad in de tabbalk opent bovenaan.
// Screenshots in e2e/screenshots/.

let api
const recipes = []

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  // Genoeg recepten dat de lijst ruim langer is dan het scherm.
  for (let i = 1; i <= 15; i++) {
    recipes.push(
      await postRecipe(api, {
        title: `Scrolltest ${String(i).padStart(2, '0')}`,
        servings: 2,
        steps_attributes: [{ body: 'Koken.' }],
        recipe_ingredients_attributes: [{ ingredient_name: 'tomaat', quantity: 1, unit: 'stuks' }],
      }),
    )
  }
})

test.afterAll(async () => {
  for (const recipe of recipes) await deleteRecipe(api, recipe.id)
  await api.dispose()
})

const scrollY = (page) => page.evaluate(() => window.scrollY)
const nav = (page) => page.getByRole('navigation', { name: 'Hoofdmenu' })

async function scrollListDown(page) {
  await page.goto('/')
  await expect(page.locator('a.recipe-card').nth(10)).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => scrollY(page)).toBeGreaterThan(500)
}

test('recept openen begint bovenaan, terug geeft de oude positie', async ({ page }) => {
  const errors = collectErrors(page)
  await scrollListDown(page)
  const before = await scrollY(page)

  // Het venster scrollt, geen container.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
    page.viewportSize().height + 500,
  )

  // Een kaart die al in beeld is, zodat de klik zelf niet scrollt.
  const index = await page.evaluate(() =>
    [...document.querySelectorAll('a.recipe-card')].findIndex((card) => {
      const { top, bottom } = card.getBoundingClientRect()
      return top > 80 && bottom < window.innerHeight - 120
    }),
  )
  expect(index).toBeGreaterThan(0)
  await page.locator('a.recipe-card').nth(index).click()
  await expect(page.locator('a.back-top')).toBeVisible()
  await expect.poll(() => scrollY(page)).toBe(0)
  await checkLayout(page, errors, 'scroll-recept-bovenaan', { fullPage: false })

  await page.goBack()
  await expect(page.locator('a.recipe-card').first()).toBeVisible()
  await expect.poll(() => scrollY(page)).toBe(before)
  await checkLayout(page, errors, 'scroll-terug-oude-positie', { fullPage: false })
})

test('elk tabblad in de tabbalk opent bovenaan', async ({ page }) => {
  const errors = collectErrors(page)
  await scrollListDown(page)

  const links = nav(page).locator('a.nav-link')
  const count = await links.count()
  for (let i = 1; i < count; i++) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await links.nth(i).click()
    await expect(links.nth(i)).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => scrollY(page)).toBe(0)
  }

  // En terug naar Recepten via het tabblad (geen browser-terug): ook bovenaan.
  await links.first().click()
  await expect(page.locator('a.recipe-card').first()).toBeVisible()
  await expect.poll(() => scrollY(page)).toBe(0)
  await checkLayout(page, errors, 'scroll-tabblad-bovenaan', { fullPage: false })
})
