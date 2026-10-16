import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'

// Voedingswaarde: NEVO-producten importeren (de zelfverzonnen minifixture, geen echte
// NEVO-data), een ingrediënt koppelen op het bewerkscherm, en het blok onderaan de
// receptpagina (dicht en open). Screenshots in e2e/screenshots/.

let api
let recipe

// Draait in de testdatabase, net als de Rails-server van playwright.config.js.
function rails(...args) {
  execFileSync('bin/rails', args, {
    cwd: '..',
    env: { ...process.env, RAILS_ENV: 'test' },
    stdio: 'inherit',
  })
}

async function ingredientId(name) {
  const list = await (await api.get('/api/ingredients')).json()
  return list.find((ingredient) => ingredient.name === name).id
}

async function link(name, code, fields = {}) {
  const id = await ingredientId(name)
  const ingredient = await (await api.get(`/api/ingredients/${id}`)).json()
  const [food] = await (await api.get(`/api/nevo_foods?q=${code}`)).json()
  const updated = await api.patch(`/api/ingredients/${id}`, {
    data: { ingredient: { lock_version: ingredient.lock_version, nevo_food_id: food.id, ...fields } },
  })
  expect(updated.status(), await updated.text()).toBe(200)
}

test.beforeAll(async ({ playwright }) => {
  rails('nevo:import', 'FILE=test/fixtures/files/nevo_mini.csv')
  api = await playwright.request.newContext({ baseURL: RAILS_URL })

  const created = await api.post('/api/recipes', {
    data: {
      recipe: {
        title: 'Bietensalade met erwten',
        servings: 2,
        steps_attributes: [{ body: 'Bieten in blokjes snijden.' }, { body: 'Alles mengen met de olie.' }],
        recipe_ingredients_attributes: [
          { ingredient_name: 'bieten', quantity: 300, unit: 'g' },
          { ingredient_name: 'erwten uit blik', quantity: 200, unit: 'g' },
          { ingredient_name: 'testolie', quantity: 2, unit: 'el' },
          { ingredient_name: 'zout' },
        ],
      },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  recipe = await created.json()

  await link('bieten', 'Testbiet')
  await link('erwten uit blik', 'Testerwten')
  // Zoals na nevo:auto_link: gekoppeld, maar nog te controleren.
  rails('runner', 'Ingredient.find_by!(name: "bieten").update!(needs_review: true)')
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

// Niets breder dan het scherm, geen console-errors, en een screenshot (hele pagina).
async function checkLayout(page, errors, name, { scrollTop = true } = {}) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  if (scrollTop) await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
}

test('ingrediëntenpagina: filter en koppelen op het bewerkscherm', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/ingredienten')

  await expect(page.getByRole('heading', { level: 1, name: 'Ingrediënten' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Ingrediënten/ }).first()).toHaveClass(/router-link-active/)
  const bieten = page.locator('.ingredient-list li', { hasText: 'bieten' })
  await expect(bieten.locator('.badge.review')).toHaveText('te controleren')

  await page.getByRole('button', { name: /Nog niet gekoppeld/ }).click()
  await expect(page.locator('.ingredient-list .name', { hasText: 'testolie' })).toBeVisible()
  await expect(page.locator('.ingredient-list .name', { hasText: 'bieten' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Alle/ }).click()
  await checkLayout(page, errors, 'ingredienten')

  // Koppelen: de suggesties komen van de naam; kiezen, omrekening invullen, opslaan.
  await page.locator('.ingredient-list a', { hasText: 'testolie' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'testolie' })).toBeVisible()
  const suggestions = page.getByRole('list', { name: 'Suggesties uit NEVO' })
  await expect(suggestions.locator('.food-name').first()).toHaveText('Testolie')
  await expect(suggestions).toContainText('per 100 g: 900 kcal · 0 g eiwit')
  await page.getByRole('button', { name: 'Kies Testolie' }).click()
  await expect(page.locator('.chosen .food-name')).toHaveText('Testolie')
  await expect(page.locator('.hint')).toHaveText('Nodig voor ml, tl en el')
  await page.getByLabel('Gram per ml').fill('0,92')
  await checkLayout(page, errors, 'ingredient-koppelen')

  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('status')).toHaveText('Opgeslagen.')
  await expect(page.locator('.changed')).toHaveCount(0)
  await expect(page.locator('#label-kcal')).toHaveAttribute('placeholder', 'NEVO: 900')
})

test('te controleren: "Klopt" bevestigt de automatische koppeling', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/ingredienten/${await ingredientId('bieten')}`)

  await expect(page.locator('.review')).toContainText('automatisch gekoppeld')
  await checkLayout(page, errors, 'ingredient-te-controleren')
  await page.getByRole('button', { name: 'Klopt' }).click()
  await expect(page.getByRole('status')).toHaveText('Gecontroleerd.')
  await expect(page.locator('.review')).toHaveCount(0)
})

test('receptpagina: voedingswaarde onderaan, dicht en open', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipe.id}`)

  const block = page.locator('details.nutrition')
  await expect(block).toBeVisible()
  await expect(block).not.toHaveAttribute('open', '')
  await expect(block.locator('table')).toBeHidden()
  await checkLayout(page, errors, 'recept-voedingswaarde-dicht')

  await block.locator('summary').first().click()
  // 300 g bieten (129 kcal) + 200 g erwten (280) + 2 el olie = 27,6 g (248,4): 657,4 kcal
  // voor 2 porties.
  const energy = block.locator('tbody tr').first()
  await expect(energy).toHaveText(/Energie\s*± 330 kcal\s*± 660 kcal/)
  await expect(block.locator('.not-counted')).toHaveText(
    'Schatting; 1 ingrediënt niet meegeteld: zout (geen hoeveelheid).',
  )
  await expect(block.locator('.unknown')).toHaveText(
    'Vezels onbekend voor erwten uit blik; niet meegeteld.',
  )
  await expect(block.locator('.citation')).toHaveText(
    'Gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.',
  )
  await expect(block.locator('.disclaimer')).toHaveText(
    'Dit is een schatting en niet medisch betrouwbaar.',
  )
  await block.locator('.sources summary').click()
  await block.scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'recept-voedingswaarde-open', { scrollTop: false })

  // Meer porties: per portie blijft gelijk, het totaal schaalt mee.
  await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(energy).toHaveText(/± 330 kcal\s*± 990 kcal/)
})
