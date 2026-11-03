import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { checkLayout, collectErrors, iphone, openOnline, postRecipe } from './helpers.js'

// Eén offline-melding (components/OfflineNotice.vue) op elk tabblad en elke pagina eronder,
// overal op dezelfde plek en in dezelfde opmaak: op de gebouwde app (met service worker),
// op een iPhone-scherm. Screenshots in e2e/screenshots/offline-melding-*.png.

let api

const RECIPE = {
  title: 'Melding-pannenkoeken',
  servings: 2,
  steps_attributes: [{ body: 'Bakken.' }],
  recipe_ingredients_attributes: [{ ingredient_name: 'bloem', quantity: 250, unit: 'g' }],
}

const COPY = /^Offline kopie van (vandaag|gisteren) \d\d:\d\d(?!,)/
const NO_COPY = 'Offline: geen verbinding met de server'

// [naam in screenshot, hoe je er komt, verwachte titel, regel "… is offline niet beschikbaar"]
const PAGES = [
  ['recepten', { nav: 'Recepten' }, COPY, null],
  ['receptdetail', { card: RECIPE.title }, COPY, null],
  ['in-huis', { nav: 'In huis' }, COPY, 'In huis'],
  ['recept-toevoegen', { nav: 'Recept toevoegen' }, NO_COPY, 'Recept toevoegen'],
  ['boodschappen', { nav: /^Boodschappen/ }, COPY, null],
  ['standaard', { nav: 'Standaard' }, COPY, null],
  ['ingredienten', { footer: 'Ingrediënten' }, NO_COPY, 'Ingrediënten'],
  ['beheer', { footer: 'Beheer' }, NO_COPY, 'Beheer'],
]

// De opmaak en plek van de melding: moet op elke pagina gelijk zijn.
function noticeLook(notice) {
  return notice.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const main = document.querySelector('main').getBoundingClientRect()
    return {
      component: element.className,
      background: style.backgroundColor,
      border: style.border,
      radius: style.borderRadius,
      padding: style.padding,
      fontSize: style.fontSize,
      left: box.left,
      width: box.width,
      // Bovenaan: geen kop of iets anders erboven.
      top: Math.round(box.top - main.top),
    }
  })
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  await postRecipe(api, RECIPE)
  expect((await api.delete('/api/shopping_list_items/clear_all')).status()).toBe(204)
  const added = await api.post('/api/shopping_list_items', {
    data: { shopping_list_items: [{ name: 'uien', source_label: 'standaard' }] },
  })
  expect(added.status(), await added.text()).toBe(201)
})

test.afterAll(async () => {
  await api.delete('/api/shopping_list_items/clear_all')
  await api.dispose()
})

test('offline: op elk tabblad dezelfde melding bovenaan', async ({ browser }) => {
  const { context, page } = await iphone(browser)
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await openOnline(page)
  // Online: geen melding.
  await expect(page.locator('.offline-notice')).toHaveCount(0)

  await context.setOffline(true)
  const looks = []
  for (const [name, to, title, unavailable] of PAGES) {
    if (to.nav) await page.locator('.main-nav').getByRole('link', { name: to.nav }).click()
    if (to.footer) await page.locator('footer').getByRole('link', { name: to.footer }).click()
    if (to.card) {
      await page.locator('.main-nav').getByRole('link', { name: 'Recepten' }).click()
      await page.locator('.recipe-card').filter({ hasText: to.card }).first().click()
    }

    const notice = page.locator('main .offline-notice:visible')
    await expect(notice, name).toHaveCount(1)
    if (typeof title === 'string') await expect(notice.locator('strong')).toHaveText(title)
    else await expect(notice).toContainText(title)
    const line = notice.locator('.offline-unavailable')
    if (unavailable) await expect(line).toHaveText(`${unavailable} is offline niet beschikbaar`)
    else await expect(line).toHaveCount(0)
    // Geen tweede melding en geen foutblok.
    await expect(page.locator('main .server-waiting')).toHaveCount(0)
    await expect(page.locator('main .notice-error:visible')).toHaveCount(0)

    looks.push([name, await noticeLook(notice)])
    await checkLayout(page, errors, `offline-melding-${name}`, { scrollTop: true })
  }

  const [[firstName, first], ...rest] = looks
  for (const [name, look] of rest) {
    expect(look, `melding op ${name} gelijk aan die op ${firstName}`).toEqual(first)
  }

  // In huis: alleen de melding, geen lijst en geen invoer.
  await page.locator('.main-nav').getByRole('link', { name: 'In huis' }).click()
  const main = page.locator('main')
  await expect(main.locator('h1:visible')).toHaveCount(0)
  await expect(main.locator('.filter-chip:visible')).toHaveCount(0)
  await expect(main.locator('input:visible, textarea:visible, select:visible')).toHaveCount(0)
  await context.close()
})
