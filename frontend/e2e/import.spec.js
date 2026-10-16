import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { test, expect } from '@playwright/test'

// De rake-imports (lib/tasks/import.rake) met de echte bestanden in db/import/, tegen de
// testdatabase, en hoe het resultaat eruitziet op een iPhone: de standaardlijst en de
// receptpagina van Pien orzo met variaties. Screenshots in e2e/screenshots/.

function rails(...args) {
  return execFileSync('bin/rails', args, {
    cwd: '..',
    env: { ...process.env, RAILS_ENV: 'test' },
    encoding: 'utf8',
  })
}

test.beforeAll(() => {
  rails('import:standard_items', 'FILE=db/import/standaardlijst.json')
  const report = rails('import:recipes', 'FILE=db/import/recepten.json')
  expect(report).toContain('met fouten.')
  expect(report).not.toContain('Validatiefouten (overgeslagen) (1')
})

// De specs delen de testdatabase: haal weg wat deze import maakte, zodat de andere
// tests een lege standaardlijst houden. De rest leegt e2e/global-teardown.js.
test.afterAll(() => {
  rails(
    'runner',
    `names = JSON.parse(File.read("db/import/standaardlijst.json")).map { |row| row["name"].squish.downcase }
     StandardItem.where(name: names).delete_all
     Recipe.find_by(title: "Pien orzo")&.destroy!`,
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
