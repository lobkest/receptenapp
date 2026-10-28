import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Links in de beschrijving van een recept zijn klikbaar en openen in een nieuw tabblad.
// Een lange link maakt de pagina niet breder dan het scherm. Screenshot in e2e/screenshots/.

const LONG_URL =
  'https://www.example.com/recepten/hoofdgerechten/vegetarisch/linzensoep-met-kokos-en-koriander?bron=nieuwsbrief'

const SOUP = {
  title: 'Bronnenstoof',
  description: `Gevonden op ${LONG_URL}.\nZie ook www.example.org voor meer.`,
  servings: 2,
  steps_attributes: [{ body: 'Alles koken.' }],
  recipe_ingredients_attributes: [{ ingredient_name: 'rode linzen', quantity: 200, unit: 'g' }],
}

let api
let recipeId

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  const created = await api.post('/api/recipes', { data: { recipe: SOUP } })
  expect(created.status(), await created.text()).toBe(201)
  recipeId = (await created.json()).id
})

test.afterAll(async () => {
  await api.dispose()
})

test('links in de beschrijving zijn klikbaar', async ({ page, context }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Niet echt naar example.com: de nieuwe tab krijgt een lege pagina.
  await context.route('**/*example.*/**', (route) => route.fulfill({ body: 'bron' }))

  await page.goto(`/recepten/${recipeId}`)
  const description = page.locator('.description')
  await expect(description).toContainText('Gevonden op')

  const links = description.getByRole('link')
  await expect(links).toHaveCount(2)
  await expect(links.first()).toHaveAttribute('href', LONG_URL)
  await expect(links.first()).toHaveAttribute('target', '_blank')
  await expect(links.nth(1)).toHaveAttribute('href', 'https://www.example.org')
  // De punt na de link hoort bij de zin.
  await expect(links.first()).toHaveText(LONG_URL)

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  await page.screenshot({ path: 'e2e/screenshots/beschrijving-links.png' })

  // Tikken opent de link in een nieuw tabblad; de receptpagina blijft open.
  const [popup] = await Promise.all([context.waitForEvent('page'), links.first().click()])
  await expect(popup).toHaveURL(LONG_URL)
  await expect(page).toHaveURL(new RegExp(`/recepten/${recipeId}$`))
  expect(errors).toEqual([])
})
