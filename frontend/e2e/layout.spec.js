import { test, expect, devices } from '@playwright/test'
import { ADMIN_TOKEN, APP_URL, RAILS_URL, useOwnIp } from './env.js'
import { giveTraits } from './traits.js'
import { checkLayout, collectErrors } from './helpers.js'

// Controleert per hoofdpagina op een iPhone-scherm: geen console-errors, niets
// breder dan het scherm, en een screenshot in e2e/screenshots/ om zelf te bekijken.

// 74 tekens zonder spatie: moet afbreken in plaats van de pagina breder te maken.
const LONG_TITLE = 'Standaardboodschappenovenschotelmetextralangetitelzonderspatiesdienietpast'
const TITLES = [LONG_TITLE, 'Pannenkoeken', 'Erwtensoep met roggebrood']

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

// Testdata via de echte API. Een nieuw recept is meteen zichtbaar.
test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  for (const title of TITLES) {
    const created = await api.post('/api/recipes', { data: recipeData(title) })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()
    recipeIds.push(id)
  }
})

// De boodschappenlijst is één gedeelde lijst in de database: elke test begint leeg.
test.beforeEach(async () => {
  const cleared = await api.delete('/api/shopping_list_items/clear_all')
  expect(cleared.status()).toBe(204)
  // Afvinken zet iets in huis, en wat in huis is slaat "Alles op lijst" over: begin
  // daarom met de standaardvoorraad.
  expect((await api.post('/api/pantry/reset')).status()).toBe(200)
})

// De database zelf wordt leeggemaakt in e2e/global-teardown.js.
test.afterAll(async () => {
  await api.dispose()
})

test('recepten: grid met twee kolommen', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()

  const columns = await page
    .locator('.recipe-grid')
    .first()
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)

  await checkLayout(page, errors, 'recepten')
})

// De opslaan-knop staat helemaal in beeld, boven de menubalk, zonder te scrollen.
async function expectSubmitInView(page) {
  const submit = await page.getByRole('button', { name: 'Recept toevoegen' }).boundingBox()
  const nav = await page.locator('.main-nav').boundingBox()
  expect(submit.y, 'knop niet boven het scherm').toBeGreaterThanOrEqual(0)
  expect(submit.y + submit.height, 'knop boven de menubalk').toBeLessThanOrEqual(nav.y)
}

test('recept toevoegen: komma, optioneel ingrediënt, en daarna de receptpagina', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await expect(page.getByRole('heading', { name: 'Recept toevoegen' })).toBeVisible()
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
  await page.getByLabel('Eenheid ingrediënt 2').selectOption('g')
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
  await page.screenshot({
    path: 'e2e/screenshots/recept-toevoegen-scherm.png',
    animations: 'disabled',
  })

  // Helemaal onderaan: de laatste inhoud ("+ stap") verdwijnt niet onder de knop.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const addStep = await page.getByRole('button', { name: '+ stap' }).boundingBox()
  const bar = await page.locator('.submit-bar').boundingBox()
  expect(addStep.y + addStep.height).toBeLessThanOrEqual(bar.y)
  await expectSubmitInView(page)

  await checkLayout(page, errors, 'recept-toevoegen')

  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recipes') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()
  expect((await response).status()).toBe(201)

  // Meteen zichtbaar: de app gaat direct naar het nieuwe recept.
  const { id } = await (await response).json()
  await expect(page).toHaveURL(new RegExp(`/recepten/${id}$`))
  await expect(page.getByRole('status')).toHaveText('"Uiensoep" is toegevoegd.')
  const lines = page.locator('.ingredients .line')
  await expect(lines).toHaveText(['1,5 stuks ui', '10 g peterselie (optioneel)'])
  const optional = lines.nth(1).locator('.optional')
  const color = await optional.evaluate((el) => getComputedStyle(el).color)
  expect(color, 'muted kleur (--color-text-muted)').toBe('rgb(107, 101, 92)')
  await checkLayout(page, errors, 'recept-optioneel')

  // "Alles op lijst" laat de peterselie weg.
  await page.getByRole('button', { name: 'Alles op lijst' }).click()
  await expect(page.locator('.added')).toContainText('behalve de optionele')
  await page.goto('/boodschappen')
  await expect(page.locator('.items input[type="checkbox"]')).toHaveCount(1)
  await expect(page.getByText('peterselie')).toHaveCount(0)
})

test('recept toevoegen: Nederlandse foutmelding bij een ongeldige hoeveelheid', async ({
  page,
}) => {
  await page.goto('/recepten/nieuw')
  await page.getByLabel('Titel').fill('Foutje')
  await page.getByLabel('Naam ingrediënt 1').fill('ui')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('abc')
  await page.getByLabel('Stap 1', { exact: true }).fill('Snijden.')
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()

  await expect(page.locator('.ingredient-row .error')).toHaveText('Hoeveelheid is geen getal')
  await expect(page.getByLabel('Hoeveelheid ingrediënt 1')).toHaveAttribute('aria-invalid', 'true')
})

test('recept toevoegen: te veel porties, melding van de server bij het veld', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/recepten/nieuw')
  await page.getByLabel('Titel').fill('Voor een weeshuis')
  await page.getByLabel('Porties').fill('60')
  await page.getByLabel('Naam ingrediënt 1').fill('rijst')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('5000')
  await page.getByLabel('Stap 1', { exact: true }).fill('Koken.')
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()

  const servings = page.getByLabel('Porties')
  await expect(servings).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.meta-row .error')).toHaveText(
    'Porties moet minder dan of gelijk zijn aan 50',
  )
  // Alleen bij het veld, geen algemene melding bovenaan het formulier.
  await expect(page.locator('.general-errors')).toHaveCount(0)
  await expect(page).toHaveURL(/\/recepten\/nieuw$/)
  // De browser logt het 422-antwoord als console-fout; dat is hier de bedoeling.
  expect(errors).toEqual([expect.stringContaining('422 (Unprocessable')])
  errors.length = 0
  await servings.scrollIntoViewIfNeeded()
  await checkLayout(page, errors, 'recept-toevoegen-porties-fout')
})

// ---------- Tags ----------

async function createRecipe(title, tagNames = []) {
  const data = recipeData(title)
  data.recipe.tag_names = tagNames
  const created = await api.post('/api/recipes', { data })
  expect(created.status(), await created.text()).toBe(201)
  return (await created.json()).id
}

function tagsInUrl(page) {
  return new URL(page.url()).searchParams.get('tags')
}

test('tags: toevoegen met bestaande en nieuwe tag, filteren, terug-navigatie', async ({ page }) => {
  // Bestaande tags (vega, pittig) en een recept met veel tags, zodat de filterrij lang wordt.
  await createRecipe('Groentecurry', ['vega', 'pittig'])
  await createRecipe('Alles-erop-en-eraan', [
    'ontbijt',
    'lunch',
    'diner',
    'feestelijk',
    'goedkoop',
    'kinderen',
    'oven',
    'winter',
  ])
  // Mozzarella is dierlijk en bevat lactose: de Caprese wordt automatisch vegetarisch en
  // glutenvrij (en notenvrij), maar niet veganistisch of lactosevrij.
  await giveTraits(api, 'mozzarella', ['dierlijk', 'lactose'])
  const errors = collectErrors(page)

  // ---- Toevoegen: "vega" uit de lijst, "Zomer" als nieuwe tag (met Enter).
  await page.goto('/recepten/nieuw')
  await page.getByLabel('Titel').fill('Caprese')
  await page.getByLabel('Naam ingrediënt 1').fill('mozzarella')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('250')
  await page.getByLabel('Stap 1', { exact: true }).fill('Snijden en aanmaken.')

  const tagSelect = page.getByLabel('Tag toevoegen')
  await expect(tagSelect.locator('option')).toContainText(['pittig', 'vega'])
  await tagSelect.selectOption('vega')
  await tagSelect.selectOption({ label: 'Nieuwe tag…' })
  await expect(page.getByLabel('Nieuwe tag', { exact: true })).toBeFocused()
  await page.getByLabel('Nieuwe tag', { exact: true }).fill('Zomer')
  await page.getByLabel('Nieuwe tag', { exact: true }).press('Enter')

  const chips = page.locator('.tag-picker .chip-name')
  await expect(chips).toHaveText(['vega', 'zomer'])
  // Enter voegde de tag toe, maar verstuurde het recept niet.
  await expect(page).toHaveURL(/\/recepten\/nieuw$/)
  const remove = await page.getByRole('button', { name: 'vega verwijderen' }).boundingBox()
  expect(remove.width).toBeGreaterThanOrEqual(40)
  expect(remove.height).toBeGreaterThanOrEqual(40)
  await page.locator('.tag-picker').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'e2e/screenshots/recept-toevoegen-tags.png',
    animations: 'disabled',
  })

  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recipes') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()
  const created = await response
  expect(created.status()).toBe(201)
  const { tags } = await created.json()
  expect(tags).toEqual(['vega', 'zomer'])

  // ---- Overzicht: tags op de kaart, filterrij scrolt binnen zichzelf.
  await page.goto('/')
  const card = page.locator('.recipe-card', { hasText: 'Caprese' })
  // Eerst de automatische tags, dan de zelfgekozen (de kaart toont er maximaal vijf).
  await expect(card.locator('.tag')).toHaveText([
    'glutenvrij',
    'notenvrij',
    'vegetarisch',
    'vega',
    'zomer',
  ])

  const row = page.locator('.tag-chips')
  const { rowScrolls } = await row.evaluate((el) => ({
    rowScrolls: el.scrollWidth > el.clientWidth,
  }))
  expect(rowScrolls, 'veel tags: de rij scrolt opzij').toBe(true)

  // ---- Filteren: zomer, dan ook vega (AND).
  const filterChip = (name) => row.getByRole('button', { name: new RegExp(`^${name}\\b`) })
  await filterChip('zomer').click()
  await expect(page).toHaveURL(/tags=zomer/)
  await expect(filterChip('zomer')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.recipe-grid .title')).toHaveText(['Caprese'])

  await filterChip('vega').click()
  await expect.poll(() => tagsInUrl(page)).toBe('zomer,vega')
  await expect(page.locator('.recipe-grid .title')).toHaveText(['Caprese'])
  await expect(page.getByRole('button', { name: 'Wis filters' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await checkLayout(page, errors, 'recepten-filter')

  // ---- Naar het recept en terug: het filter staat er nog.
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Caprese' })).toBeVisible()
  await page.goBack()
  await expect.poll(() => tagsInUrl(page)).toBe('zomer,vega')
  await expect(filterChip('vega')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.recipe-grid .title')).toHaveText(['Caprese'])

  // ---- Lege uitkomst: zomer + vega + pittig bestaat niet.
  await filterChip('pittig').click()
  await expect(page.getByText('Geen recepten met zomer + vega + pittig')).toBeVisible()
  await checkLayout(page, errors, 'recepten-geen-resultaat')

  // ---- Wis filters: alles weer zichtbaar.
  await page.getByRole('button', { name: 'Wis filters' }).click()
  await expect.poll(() => tagsInUrl(page)).toBeNull()
  await expect(page.locator('.recipe-grid .title', { hasText: 'Groentecurry' })).toBeVisible()
})

// ---------- Iedereen bewerkt; verwijderen is een verzoek; beheer zet terug ----------

// De beheercode in sessionStorage, net als na inloggen op /beheer.
async function loginAsAdmin(page) {
  await useOwnIp(page, 10)
  await page.addInitScript((code) => sessionStorage.setItem('adminCode', code), ADMIN_TOKEN)
}

test('toevoegen, bewerken (met conflict), verwijderverzoek, terugzetten en versie terugzetten', async ({
  page,
}) => {
  const errors = collectErrors(page)
  page.on('dialog', (dialog) => dialog.accept()) // window.confirm bij "Nieuwste versie laden"

  // ---- Toevoegen: meteen zichtbaar, zonder goedkeuring.
  await page.goto('/recepten/nieuw')
  await expect(page.getByRole('heading', { name: 'Recept toevoegen' })).toBeVisible()
  await expect(page.locator('.main-nav')).toContainText('Recept toevoegen')
  await page.getByLabel('Titel').fill('Linzensoep')
  await page.getByLabel('Porties').fill('4')
  await page.getByLabel('Naam ingrediënt 1').fill('linzen')
  await page.getByLabel('Hoeveelheid ingrediënt 1').fill('250')
  await page.getByLabel('Stap 1', { exact: true }).fill('Linzen koken.')
  await page.getByRole('button', { name: 'Recept toevoegen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Linzensoep' })).toBeVisible()
  const id = Number(new URL(page.url()).pathname.split('/').pop())

  await page.goto('/')
  await expect(page.locator('.recipe-grid .title', { hasText: 'Linzensoep' })).toBeVisible()

  // ---- Bewerken vanaf de receptpagina, zonder code.
  await page.goto(`/recepten/${id}`)
  await page.getByRole('link', { name: 'Bewerken' }).click()
  await expect(page.getByRole('heading', { name: 'Recept bewerken' })).toBeVisible()
  await page.getByLabel('Titel').fill('Linzensoep met citroen')
  await page.screenshot({ path: 'e2e/screenshots/recept-bewerken.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Linzensoep met citroen' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('"Linzensoep met citroen" is opgeslagen.')

  // ---- Conflict: iemand anders slaat op terwijl wij bewerken.
  await page.getByRole('link', { name: 'Bewerken' }).click()
  await page.getByLabel('Porties').fill('6')
  const current = await (await api.get(`/api/recipes/${id}`)).json()
  const other = await api.patch(`/api/recipes/${id}`, {
    data: { recipe: { lock_version: current.lock_version, description: 'Van iemand anders.' } },
  })
  expect(other.ok(), await other.text()).toBe(true)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Dit recept is intussen door iemand anders gewijzigd. Herlaad en probeer opnieuw.',
  )
  await expect(page.getByLabel('Porties')).toHaveValue('6')
  // De browser logt elk 4xx-antwoord als console-fout; deze 409 is hier juist de bedoeling.
  expect(errors).toEqual([expect.stringContaining('409 (Conflict)')])
  errors.length = 0
  await checkLayout(page, errors, 'recept-bewerken-conflict')
  await page.getByRole('button', { name: 'Nieuwste versie laden' }).click()
  await expect(page.getByLabel('Beschrijving')).toHaveValue('Van iemand anders.')
  await expect(page.getByLabel('Porties')).toHaveValue('4')

  // ---- Verwijderen aanvragen: dialoog met reden, daarna weg uit het overzicht.
  await page.goto(`/recepten/${id}`)
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  const dialog = page.getByRole('dialog', { name: '"Linzensoep met citroen" verwijderen?' })
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused()
  await dialog.getByLabel('Reden (optioneel)').fill('Testrecept')
  await page.screenshot({ path: 'e2e/screenshots/recept-verwijderen.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('status')).toHaveText('"Linzensoep met citroen" is verwijderd.')
  await expect(page.locator('.recipe-grid .title', { hasText: 'Linzensoep' })).toHaveCount(0)
  expect((await api.get(`/api/recipes/${id}`)).status()).toBe(404)

  // ---- Beheer: het verzoek staat in de lijst; terugzetten maakt het weer zichtbaar.
  await loginAsAdmin(page)
  await page.goto('/beheer')
  const request = page.locator('.requests li', { hasText: 'Linzensoep met citroen' })
  await expect(request).toContainText('Reden: Testrecept')
  await checkLayout(page, errors, 'beheer-verwijderverzoeken')
  await request.getByRole('button', { name: 'Terugzetten' }).click()
  await expect(page.getByRole('status')).toContainText('is teruggezet en weer zichtbaar.')
  await page.goto('/')
  await expect(
    page.locator('.recipe-grid .title', { hasText: 'Linzensoep met citroen' }),
  ).toBeVisible()

  // ---- Versies: de eerste versie terugzetten brengt titel en beschrijving terug.
  await page.goto(`/recepten/${id}`)
  await page.getByRole('link', { name: 'Versies' }).click()
  const versions = page.locator('.versions li')
  await expect(versions.locator('.summary')).toHaveText([
    'Gewijzigd: beschrijving',
    'Gewijzigd: titel',
    'Eerste versie',
  ])
  await expect(versions.first()).toContainText('Huidige versie')
  await versions.last().getByRole('button', { name: 'Deze versie terugzetten' }).click()
  const confirm = page.getByRole('dialog', { name: 'Deze versie terugzetten?' })
  await confirm.getByRole('button', { name: 'Terugzetten' }).click()
  await expect(page.getByRole('status')).toContainText('is teruggezet.')
  await expect(versions.first().locator('.summary')).toContainText('Teruggezet naar de versie van')
  await expect(versions).toHaveCount(4)
  await checkLayout(page, errors, 'beheer-versies')

  await page.goto(`/recepten/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Linzensoep' })).toBeVisible()
  await expect(page.locator('.description')).toHaveCount(0)
})

test('receptdetail met lange titel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto(`/recepten/${recipeIds[0]}`)
  await expect(page.getByRole('heading', { level: 1, name: LONG_TITLE })).toBeVisible()

  await checkLayout(page, errors, 'recept-detail')
})

test('boodschappen: afvinken met een groene checkbox', async ({ page }) => {
  const errors = collectErrors(page)
  // Eerst vullen vanaf een recept; de lijst staat op de server.
  await page.goto(`/recepten/${recipeIds[1]}`)
  await page.locator('.add-all').click()
  await expect(page.getByRole('status')).toContainText('Alle ingrediënten')
  await page.goto('/boodschappen')

  const checkboxes = page.locator('.items input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(3)
  await checkboxes.first().check()

  // Thema-groen (--color-brand), niet de zwarte standaard van de browser.
  const accent = await checkboxes.first().evaluate((box) => getComputedStyle(box).accentColor)
  expect(accent).toBe('rgb(46, 125, 67)')
  await expect(page.getByRole('button', { name: 'Afgevinkte wissen' })).toBeEnabled()
  await expect(page.getByText('Ik ga winkelen')).toHaveCount(0)
  await expect(page.getByText('alleen in deze browser')).toHaveCount(0)

  // "Alles wissen" vraagt eerst om bevestiging in een venster.
  await page.getByRole('button', { name: 'Alles wissen' }).click()
  const dialog = page.getByRole('dialog', { name: 'De hele boodschappenlijst wissen?' })
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused()
  await page.screenshot({ path: 'e2e/screenshots/boodschappen-wissen.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Annuleren' }).click()
  await expect(dialog).toBeHidden()
  await expect(checkboxes).toHaveCount(3)

  await checkLayout(page, errors, 'boodschappen')
})

// ---------- Standaardboodschappen (op de server, openbaar) ----------

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
    const created = await api.post('/api/standard_items', { data: { standard_item: item } })
    expect(created.status(), await created.text()).toBe(201)
  }
}

async function standardNamesOnServer() {
  const response = await api.get('/api/standard_items')
  return (await response.json()).map((item) => item.name)
}

test('standaard: toevoegen met nieuwe categorie, verwijderen met bevestiging', async ({ page }) => {
  await createStandardItems()
  const errors = collectErrors(page)
  await page.goto('/standaard')
  await expect(page.locator('.items .line')).toHaveCount(STANDARD_ITEMS.length)
  // Zonder beheercode: geen inlogmelding meer.
  await expect(page.getByText('beheercode')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Inloggen bij Beheer' })).toHaveCount(0)

  // Compact: naam links, drie icoonknoppen van minstens 40×40 (--tap).
  for (const label of ['melk op boodschappenlijst', 'melk bewerken', 'melk verwijderen']) {
    const box = await page.getByRole('button', { name: label }).boundingBox()
    expect(box.width, label).toBeGreaterThanOrEqual(40)
    expect(box.height, label).toBeGreaterThanOrEqual(40)
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
  await page.screenshot({
    path: 'e2e/screenshots/standaard-verwijderen.png',
    animations: 'disabled',
  })
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
  await page.screenshot({ path: 'e2e/screenshots/standaard-selectie.png', animations: 'disabled' })

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

// ---------- Gedeelde boodschappenlijst: twee telefoons ----------

// Twee losse browsercontexten zijn twee telefoons: geen gedeelde cookies of opslag.
async function newPhone(browser) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
    baseURL: APP_URL,
  })
  const page = await context.newPage()
  return { context, page, errors: collectErrors(page) }
}

// Zoals terugschakelen naar de app: de browser meldt visibilitychange naar "visible".
// Headless Chromium wisselt dat niet zelf tussen contexten, dus we zetten het na.
async function switchBackTo(page) {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }
  })
}

test('boodschappen: gedeeld tussen twee telefoons', async ({ browser }) => {
  const phoneA = await newPhone(browser)
  const phoneB = await newPhone(browser)
  const checkboxes = (page) => page.locator('.items input[type="checkbox"]')
  // Op naam, niet op plaats: de lijst staat per categorie van de standaardlijst, en die
  // hangt af van eerdere specs (melk kan in "zuivel" bovenaan staan).
  const row = (page, name) => page.locator('.items li').filter({ hasText: name })
  const sortedLines = async (page) =>
    (await page.locator('.items .line').allTextContents()).map((t) => t.trim()).sort()

  // A zet een recept op de lijst en opent de lijst.
  await phoneA.page.goto(`/recepten/${recipeIds[2]}`)
  await phoneA.page.locator('.add-all').click()
  await expect(phoneA.page.getByRole('status')).toContainText('Alle ingrediënten')
  await phoneA.page.goto('/boodschappen')
  await expect(checkboxes(phoneA.page)).toHaveCount(3)
  await expect(phoneA.page.locator('.shopping-link')).toContainText('Boodschappen (3)')

  // B ziet dezelfde lijst (na herladen) en vinkt de bloem af.
  await phoneB.page.goto('/boodschappen')
  await phoneB.page.reload()
  await expect.poll(() => sortedLines(phoneB.page)).toEqual(['250 g bloem', '500 ml melk', 'zout'])
  await expect(phoneB.page.locator('.items .sources').first()).toHaveText(
    'uit: Erwtensoep met roggebrood',
  )
  const saved = phoneB.page.waitForResponse(
    (r) => r.url().includes('/api/shopping_list_items/') && r.request().method() === 'PATCH',
  )
  await row(phoneB.page, 'bloem').getByRole('checkbox').check()
  expect((await saved).status()).toBe(200)
  await expect(phoneB.page.locator('.shopping-link')).toContainText('Boodschappen (2)')
  await checkLayout(phoneB.page, phoneB.errors, 'boodschappen-telefoon-b')

  // A heeft nog de oude stand; na terugkeren naar de app is de bloem afgevinkt.
  await expect(row(phoneA.page, 'bloem').getByRole('checkbox')).not.toBeChecked()
  await switchBackTo(phoneA.page)
  await expect(row(phoneA.page, 'bloem').getByRole('checkbox')).toBeChecked()
  await expect(row(phoneA.page, 'bloem')).toHaveClass(/checked/)
  await expect(phoneA.page.locator('.shopping-link')).toContainText('Boodschappen (2)')
  await checkLayout(phoneA.page, phoneA.errors, 'boodschappen-telefoon-a')

  await phoneA.context.close()
  await phoneB.context.close()
})

// Raden naar de beheercode: na 10 pogingen per minuut weigert de server alles van dit
// adres, ook de goede code, met een Nederlandse melding.
test('beheer: te veel pogingen geeft een 429 met melding', async ({ page }) => {
  const errors = collectErrors(page)
  await useOwnIp(page, 12)
  await page.goto('/beheer')
  const code = page.getByLabel('Beheercode')
  const submit = page.getByRole('button', { name: 'Inloggen' })

  for (let attempt = 1; attempt <= 10; attempt++) {
    await code.fill(`fout-${attempt}`)
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Deze code is onjuist.')
  }

  // Poging 11, nu met de goede code: toch geweigerd.
  await code.fill(ADMIN_TOKEN)
  await submit.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Te veel pogingen. Wacht een minuut en probeer het opnieuw.',
  )
  await expect(page.getByLabel('Beheercode')).toBeVisible()
  // De browser logt elk 4xx-antwoord als console-fout; deze 401's en 429 zijn de bedoeling.
  expect(errors).toHaveLength(11)
  expect(errors.at(-1)).toContain('429 (Too Many Requests)')
  errors.length = 0
  await checkLayout(page, errors, 'beheer-te-veel-pogingen')
})

test('niet vindbaar voor zoekmachines', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
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
