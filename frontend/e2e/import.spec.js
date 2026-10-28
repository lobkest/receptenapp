import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { test, expect } from '@playwright/test'

// De rake-imports (lib/tasks/import.rake) met de echte bestanden in db/import/, tegen de
// testdatabase, en hoe het resultaat eruitziet op een iPhone: de standaardlijst, het
// overzicht, recepten met variaties en zonder hoeveelheden, geschaald en op de
// boodschappenlijst. Screenshots in e2e/screenshots/.

const RECIPE_FILES = ['db/import/recepten.json', 'db/import/recepten_batch2.json']

function rails(...args) {
  return execFileSync('bin/rails', args, {
    cwd: '..',
    env: { ...process.env, RAILS_ENV: 'test' },
    encoding: 'utf8',
  })
}

test.beforeAll(() => {
  rails('import:standard_items', 'FILE=db/import/standaardlijst.json')
  for (const file of RECIPE_FILES) {
    expect(rails('import:recipes', `FILE=${file}`)).toContain(' 0 met fouten.')
  }
})

// De specs delen de testdatabase: haal weg wat deze import maakte, zodat de andere
// tests een lege standaardlijst en boodschappenlijst houden en alleen hun eigen recepten
// zien. De rest leegt e2e/global-teardown.js.
test.afterAll(() => {
  rails(
    'runner',
    `names = JSON.parse(File.read("db/import/standaardlijst.json")).map { |row| row["name"].squish.downcase }
     StandardItem.where(name: names).delete_all
     ShoppingListItem.delete_all
     titles = ${JSON.stringify(RECIPE_FILES)}.flat_map { |file| JSON.parse(File.read(file)).map { |row| row["title"] } }
     Recipe.where(title: titles).find_each(&:destroy!)`,
  )
})

function collectErrors(page) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function checkLayout(page, errors, name) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'geen horizontale overflow').toBeLessThanOrEqual(innerWidth)
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors, 'geen console-errors').toEqual([])
}

test('import: standaardlijst per categorie', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/standaard')

  await expect(page.getByText('kiwi gold')).toBeVisible()
  await expect(page.getByText('vaseline')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'groente & fruit' })).toBeVisible()
  await checkLayout(page, errors, 'import-standaardlijst')
})

test('import: Pien orzo met ingrediënten en variaties', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await page.getByRole('link', { name: /Pien orzo/ }).click()

  await expect(page.getByRole('heading', { name: 'Pien orzo' })).toBeVisible()
  await expect(page.getByText('Hoeveelheden met * zijn geschat.')).toBeVisible()
  await expect(page.getByText('diepvriesspinazie')).toBeVisible()
  const variations = page.locator('section.variations')
  await expect(variations).toContainText('Met zalm')
  await expect(variations).toContainText('Met mozzarella')
  await checkLayout(page, errors, 'import-pien-orzo')
})

test('import: receptenoverzicht met de tweede batch', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')

  for (const title of ['Arequipa smoothie bowl', 'Flatbread salade', 'Wraps', 'Pien orzo']) {
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  }
  await checkLayout(page, errors, 'import-recepten')
})

test('import: Wraps met twee variaties', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await page.getByRole('link', { name: /Wraps/ }).click()

  await expect(page.getByRole('heading', { name: 'Wraps', level: 1 })).toBeVisible()
  const variations = page.locator('section.variations')
  await expect(variations).toContainText('Met kipschnitzel')
  await expect(variations).toContainText('Met kipfilet')
  await expect(variations).toContainText('kipgehakt')
  await checkLayout(page, errors, 'import-wraps')
})

test('import: Pasta wortel saus, geschaald naar 8 porties en alles op de lijst', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.request.delete('/api/shopping_list_items/clear_all')
  await page.goto('/')
  await page.getByRole('link', { name: /Pasta wortel saus/ }).click()

  const lines = page.locator('.ingredients .line')
  await expect(lines).toHaveText([
    '200 g wortel',
    '120 g bleekselderij',
    '800 g gepelde tomaten',
    'gehaktkruiden',
    'paprikapoeder',
    'rode ui',
    'italiaanse kruiden',
    'gehakt half-om-half',
    'knoflook',
  ])
  await checkLayout(page, errors, 'import-pasta-wortel-saus')

  // 4 → 8 porties: met hoeveelheid verdubbeld, zonder hoeveelheid alleen de naam.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Meer porties' }).click()
  await expect(page.locator('.servings-count')).toHaveText('8 porties')
  await expect(lines).toHaveText([
    '400 g wortel',
    '240 g bleekselderij',
    '1.600 g gepelde tomaten',
    'gehaktkruiden',
    'paprikapoeder',
    'rode ui',
    'italiaanse kruiden',
    'gehakt half-om-half',
    'knoflook',
  ])
  await expect(page.locator('.ingredients')).not.toContainText(/NaN|undefined|\b0 /)
  await checkLayout(page, errors, 'import-pasta-wortel-saus-8')

  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.goto('/boodschappen')
  const items = page.locator('.items li')
  await expect(items).toHaveCount(9)
  // Per categorie kan de lijst over meer dan één .items staan.
  await expect(items.filter({ hasText: '1.600 g gepelde tomaten' })).toHaveCount(1)
  await expect(items.filter({ hasText: 'gehaktkruiden' })).toHaveCount(1)
  await expect(items.filter({ hasText: /NaN|undefined|\b0 / })).toHaveCount(0)
  await checkLayout(page, errors, 'import-boodschappen-pasta-wortel-saus')
})
