import { test, expect } from '@playwright/test'
import { ADMIN_TOKEN, RAILS_URL } from './env.js'

// Controleert per hoofdpagina op een iPhone-scherm: geen console-errors, niets
// breder dan het scherm, en een screenshot in e2e/screenshots/ om zelf te bekijken.

// 74 tekens zonder spatie: moet afbreken in plaats van de pagina breder te maken.
const LONG_TITLE = 'Standaardboodschappenovenschotelmetextralangetitelzonderspatiesdienietpast'
const TITLES = [LONG_TITLE, 'Pannenkoeken', 'Erwtensoep met roggebrood']

const ADMIN_HEADERS = { Authorization: `Bearer ${ADMIN_TOKEN}` }

let api
const recipeIds = []

function recipeData(title) {
  return {
    recipe: {
      title,
      description: 'Testrecept van de e2e-tests.',
      servings: 4,
      steps_attributes: [{ body: 'Alles mengen en bakken.' }],
      recipe_ingredients_attributes: [
        { ingredient_name: 'bloem', quantity: 250, unit: 'g' },
        { ingredient_name: 'melk', quantity: 500, unit: 'ml' },
        { ingredient_name: 'zout', quantity: null, unit: null },
      ],
    },
  }
}

// Testdata via de echte API: insturen (publiek) en goedkeuren (beheer).
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  for (const title of TITLES) {
    const created = await api.post('/api/recipes', { data: recipeData(title) })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()
    recipeIds.push(id)

    const approved = await api.patch(`/api/admin/recipes/${id}/approve`, { headers: ADMIN_HEADERS })
    expect(approved.ok(), await approved.text()).toBe(true)
  }
})

// De database zelf wordt leeggemaakt in e2e/global-teardown.js.
test.afterAll(async () => {
  await api.dispose()
})

// Verzamelt console-errors en onafgevangen fouten van de pagina.
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

  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })
  expect(errors, 'geen console-errors').toEqual([])
}

test('recepten: grid met twee kolommen', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()

  const columns = await page
    .locator('.recipe-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)

  await checkLayout(page, errors, 'recepten')
})

// De opslaan-knop staat helemaal in beeld, boven de menubalk, zonder te scrollen.
async function expectSubmitInView(page) {
  const submit = await page.getByRole('button', { name: 'Recept insturen' }).boundingBox()
  const nav = await page.locator('.main-nav').boundingBox()
  expect(submit.y, 'knop niet boven het scherm').toBeGreaterThanOrEqual(0)
  expect(submit.y + submit.height, 'knop boven de menubalk').toBeLessThanOrEqual(nav.y)
}

test('recept insturen: komma, optioneel ingrediënt, en daarna de receptpagina', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await expect(page.getByRole('heading', { name: 'Recept insturen' })).toBeVisible()
  await expectSubmitInView(page)

  await page.getByLabel('Titel').fill('Uiensoep')
  await page.getByLabel('Beschrijving').fill('Snel en goedkoop.')
  await page.getByLabel('Porties').fill('3')
  await page.getByLabel('Naam ingrediënt 1').fill('ui')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('1,5')
  await page.getByLabel('Eenheid ingrediënt 1').selectOption('stuks')
  await page.getByRole('button', { name: '+ ingrediënt' }).click()
  await page.getByLabel('Naam ingrediënt 2').fill('peterselie')
  await page.getByLabel('Hoeveelheid ingrediënt 2').fill('10')
  await page.locator('.ingredient-row').nth(1).getByLabel('optioneel').check()
  await page.getByLabel('Stap 1', { exact: true }).fill('Uien snijden.')
  await page.getByRole('button', { name: '+ stap' }).click()
  await page
    .getByLabel('Stap 2', { exact: true })
    .fill(
      'Uien zacht laten worden in boter, bouillon erbij, twintig minuten zachtjes laten ' +
        'koken en op het laatst de peterselie erover strooien.',
    )

  // Bereidingsstappen beginnen op 2 regels en groeien mee met de tekst.
  const [short, long] = await page
    .locator('.step-row textarea')
    .evaluateAll((areas) => areas.map((area) => area.offsetHeight))
  expect(long).toBeGreaterThan(short)

  // Midden in het formulier: de knop blijft in beeld.
  await page.getByLabel('Naam ingrediënt 2').scrollIntoViewIfNeeded()
  await expectSubmitInView(page)
  await page.screenshot({ path: 'e2e/screenshots/recept-insturen-scherm.png' })

  // Helemaal onderaan: de laatste inhoud ("+ stap") verdwijnt niet onder de knop.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const addStep = await page.getByRole('button', { name: '+ stap' }).boundingBox()
  const bar = await page.locator('.submit-bar').boundingBox()
  expect(addStep.y + addStep.height).toBeLessThanOrEqual(bar.y)
  await expectSubmitInView(page)

  await checkLayout(page, errors, 'recept-insturen')

  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recipes') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Recept insturen' }).click()
  expect((await response).status()).toBe(201)
  await expect(page.getByText('Bedankt! Je recept wacht op goedkeuring.')).toBeVisible()

  // Goedkeuren via de beheer-API, anders is het recept niet te zien.
  const { id } = await (await response).json()
  const approved = await api.patch(`/api/admin/recipes/${id}/approve`, { headers: ADMIN_HEADERS })
  expect(approved.ok(), await approved.text()).toBe(true)

  await page.goto(`/recepten/${id}`)
  const lines = page.locator('.ingredients .line')
  await expect(lines).toHaveText(['1,5 stuks ui', '10 g peterselie (optioneel)'])
  const optional = lines.nth(1).locator('.optional')
  const color = await optional.evaluate((el) => getComputedStyle(el).color)
  expect(color, 'muted kleur (--color-text-muted)').toBe('rgb(107, 101, 92)')
  await checkLayout(page, errors, 'recept-optioneel')

  // "Alles op lijst" laat de peterselie weg.
  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await page.goto('/boodschappen')
  await expect(page.locator('.items input[type="checkbox"]')).toHaveCount(1)
  await expect(page.getByText('peterselie')).toHaveCount(0)
})

test('recept insturen: Nederlandse foutmelding bij een ongeldige hoeveelheid', async ({ page }) => {
  await page.goto('/recepten/nieuw')
  await page.getByLabel('Titel').fill('Foutje')
  await page.getByLabel('Naam ingrediënt 1').fill('ui')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('abc')
  await page.getByLabel('Stap 1', { exact: true }).fill('Snijden.')
  await page.getByRole('button', { name: 'Recept insturen' }).click()

  await expect(page.locator('.ingredient-row .error')).toHaveText('Hoeveelheid is geen getal')
  await expect(page.getByLabel('Hoeveelheid ingrediënt 1')).toHaveAttribute('aria-invalid', 'true')
})

test('receptdetail met lange titel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeIds[0]}`)
  await expect(page.getByRole('heading', { level: 1, name: LONG_TITLE })).toBeVisible()

  await checkLayout(page, errors, 'recept-detail')
})

test('boodschappen: afvinken met een groene checkbox', async ({ page }) => {
  const errors = collectErrors(page)
  // De lijst staat in localStorage: eerst vullen vanaf een recept.
  await page.goto(`/recepten/${recipeIds[1]}`)
  await page.locator('.add-all').click()
  await page.goto('/boodschappen')

  const checkboxes = page.locator('.items input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(3)
  await checkboxes.first().check()

  // Thema-groen (--color-brand), niet de zwarte standaard van de browser.
  const accent = await checkboxes.first().evaluate((box) => getComputedStyle(box).accentColor)
  expect(accent).toBe('rgb(46, 125, 67)')
  await expect(page.getByRole('button', { name: 'Afgevinkte wissen' })).toBeEnabled()
  await expect(page.getByText('Ik ga winkelen')).toHaveCount(0)

  // "Alles wissen" vraagt eerst om bevestiging in een venster.
  await page.getByRole('button', { name: 'Alles wissen' }).click()
  const dialog = page.getByRole('dialog', { name: 'De hele boodschappenlijst wissen?' })
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused()
  await page.screenshot({ path: 'e2e/screenshots/boodschappen-wissen.png' })
  await dialog.getByRole('button', { name: 'Annuleren' }).click()
  await expect(dialog).toBeHidden()
  await expect(checkboxes).toHaveCount(3)

  await checkLayout(page, errors, 'boodschappen')
})

// ---------- Standaardboodschappen (op de server, achter de beheercode) ----------

const STANDARD_ITEMS = [
  { name: 'melk', category: 'zuivel' },
  { name: 'kaas', category: 'zuivel' },
  { name: 'yoghurt', category: 'zuivel' },
  { name: 'banaan', category: 'groente & fruit' },
  { name: 'appels', category: 'groente & fruit' },
  { name: 'brood', category: 'bakker' },
  { name: 'wc-papier', category: null },
]

async function createStandardItems() {
  for (const item of STANDARD_ITEMS) {
    const created = await api.post('/api/admin/standard_items', {
      data: { standard_item: item },
      headers: ADMIN_HEADERS,
    })
    expect(created.status(), await created.text()).toBe(201)
  }
}

async function standardNamesOnServer() {
  const response = await api.get('/api/admin/standard_items', { headers: ADMIN_HEADERS })
  return (await response.json()).map((item) => item.name)
}

// Ingelogd bij beheer: de code staat in sessionStorage, net als na inloggen op /beheer.
async function loginAsAdmin(page) {
  await page.addInitScript((code) => sessionStorage.setItem('adminCode', code), ADMIN_TOKEN)
}

test('standaard: zonder beheercode een melding met link naar Beheer', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/standaard')

  await expect(page.getByText('alleen te zien met de beheercode')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inloggen bij Beheer' })).toHaveAttribute(
    'href',
    '/beheer',
  )
  await expect(page.getByText('Voorbeeldlijst laden')).toHaveCount(0)
  await checkLayout(page, errors, 'standaard-zonder-code')
})

test('standaard: toevoegen met nieuwe categorie, verwijderen met bevestiging', async ({ page }) => {
  await createStandardItems()
  await loginAsAdmin(page)
  const errors = collectErrors(page)
  await page.goto('/standaard')
  await expect(page.locator('.items .line')).toHaveCount(STANDARD_ITEMS.length)

  // Compact: naam links, drie icoonknoppen van minstens 44×44.
  for (const label of ['melk op boodschappenlijst', 'melk bewerken', 'melk verwijderen']) {
    const box = await page.getByRole('button', { name: label }).boundingBox()
    expect(box.width, label).toBeGreaterThanOrEqual(44)
    expect(box.height, label).toBeGreaterThanOrEqual(44)
  }

  // Toevoegen met een nieuwe categorie.
  const addForm = page.locator('.add-card')
  await addForm.getByLabel('Naam').fill('Chocola')
  await addForm.getByLabel('Categorie').selectOption({ label: 'Nieuwe categorie…' })
  await expect(addForm.getByLabel('Nieuwe categorie')).toBeFocused()
  await addForm.getByLabel('Nieuwe categorie').fill('Snoep')
  await addForm.getByRole('button', { name: 'Toevoegen' }).click()
  await expect(page.getByRole('heading', { name: 'snoep' })).toBeVisible()
  await expect(addForm.getByLabel('Naam')).toHaveValue('')
  await expect(addForm.getByLabel('Categorie').locator('option')).toContainText(['snoep'])

  // Verwijderen: eerst een venster, focus op Annuleren; Escape sluit zonder te verwijderen.
  await page.getByRole('button', { name: 'banaan verwijderen' }).click()
  const dialog = page.getByRole('dialog', { name: 'banaan verwijderen?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused()
  await page.screenshot({ path: 'e2e/screenshots/standaard-verwijderen.png' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.items .line', { hasText: 'banaan' })).toHaveCount(1)

  await page.getByRole('button', { name: 'banaan verwijderen' }).click()
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page.locator('.items .line', { hasText: 'banaan' })).toHaveCount(0)
  expect(await standardNamesOnServer()).not.toContain('banaan')

  await page.evaluate(() => window.scrollTo(0, 0))
  await checkLayout(page, errors, 'standaard')
})

test('standaard: selectiemodus, op lijst en bulk-verwijderen', async ({ page }) => {
  await loginAsAdmin(page)
  const errors = collectErrors(page)
  await page.goto('/standaard')
  await expect(page.locator('.items .line').first()).toBeVisible()

  // Buiten de selectiemodus: geen checkboxes en geen balk.
  await expect(page.locator('.items input[type="checkbox"]')).toHaveCount(0)
  await expect(page.locator('.bottom-bar')).toHaveCount(0)

  await page.getByRole('button', { name: 'Selecteren' }).click()
  await page.getByLabel('melk').check()
  await page.getByLabel('wc-papier').check()
  await page.getByRole('button', { name: 'Op lijst (2)' }).click()
  await expect(page.getByRole('status')).toContainText('2 items op je boodschappenlijst gezet.')
  await expect(page.locator('.items input[type="checkbox"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Selecteren' }).click()
  for (const name of ['kaas', 'yoghurt', 'appels']) await page.getByLabel(name).check()

  // De balk plakt onderaan, boven de menubalk.
  const bar = await page.locator('.bottom-bar').boundingBox()
  const nav = await page.locator('.main-nav').boundingBox()
  expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y)
  expect(bar.y).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e/screenshots/standaard-selectie.png' })

  await page.getByRole('button', { name: 'Verwijderen (3)' }).click()
  const dialog = page.getByRole('dialog', { name: '3 items verwijderen?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page.getByRole('status')).toContainText('3 items verwijderd.')
  // Per groep: bakker, snoep, zuivel, overig.
  await expect(page.locator('.items .line')).toHaveText(['brood', 'chocola', 'melk', 'wc-papier'])

  const remaining = await standardNamesOnServer()
  expect(remaining.sort()).toEqual(['brood', 'chocola', 'melk', 'wc-papier'])
  await checkLayout(page, errors, 'standaard-na-bulk')

  // Op de boodschappenlijst kwamen ze zonder hoeveelheid, "uit: standaard".
  await page.goto('/boodschappen')
  await expect(page.locator('.items .line')).toContainText(['melk', 'wc-papier'])
})

test('licht thema, ook als de telefoon op donker staat', async ({ page }) => {
  await page.goto('/')
  const { scheme, background } = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
  }))
  expect(scheme).toBe('light')
  expect(background).toBe('rgb(250, 248, 244)')
})
