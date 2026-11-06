import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'
import { checkLayout, collectErrors, postRecipe } from './helpers.js'

// De effen strook achter de iOS-statusbalk (#status-bar-backdrop, index.html en main.css):
// een echt element, vast bovenaan, volledig dekkend, en met is-scrolled zodra je gescrold
// bent (IntersectionObserver in App.vue). Het iOS 26-blureffect zelf toont Playwright
// niet; dat controleer je op een iPhone.
//
// Chromium heeft geen notch: env(safe-area-inset-top) is daar 0. Via CDP doen we alsof er
// een statusbalk van 47 px is (iPhone 13), zodat de strook ook echt op de screenshot staat.
const INSET = 47
const BACKDROP = '#status-bar-backdrop'

let api
let recipe

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: RAILS_URL })
  // Lang genoeg om te scrollen: twintig stappen.
  recipe = await postRecipe(api, {
    title: 'Statusbalkstoofpot',
    servings: 4,
    steps_attributes: Array.from({ length: 20 }, (_, i) => ({
      body: `Stap ${i + 1}: roeren, proeven en nog eens goed roeren tot alles mooi gaar is.`,
    })),
    recipe_ingredients_attributes: [{ ingredient_name: 'ui', quantity: 2, unit: 'stuks' }],
  })
})

test.afterAll(async () => {
  if (recipe) await deleteRecipe(api, recipe.id)
  await api.dispose()
})

// Alleen Chromium kent dit CDP-commando; de iPhone-emulatie draait op Chromium.
async function fakeNotch(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: INSET } })
}

function backdropStyle(page) {
  return page.locator(BACKDROP).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      parentIsBody: element.parentElement === document.body,
      position: style.position,
      background: style.backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      opacity: style.opacity,
      backdropFilter: style.backdropFilter,
      pointerEvents: style.pointerEvents,
      top: element.getBoundingClientRect().top,
      height: element.getBoundingClientRect().height,
      width: element.getBoundingClientRect().width,
      appPaddingTop: getComputedStyle(document.getElementById('app')).paddingTop,
    }
  })
}

test('strook: vast, schermbreed en ondoorzichtig; lijntje alleen als je gescrold bent', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await fakeNotch(page)
  await page.goto(`/recepten/${recipe.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const style = await backdropStyle(page)
  expect(style.parentIsBody, 'buiten #app, direct in <body>').toBe(true)
  expect(style.position).toBe('fixed')
  expect(style.top).toBe(0)
  expect(style.height).toBe(INSET)
  expect(style.width).toBe(page.viewportSize().width)
  // Volledig dekkend: rgb(...) zonder alfa, en dezelfde kleur als de pagina.
  expect(style.background).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  expect(style.background).toBe(style.bodyBackground)
  expect(style.opacity).toBe('1')
  expect(style.backdropFilter).toBe('none')
  expect(style.pointerEvents).not.toBe('none')
  // De inhoud begint nog steeds onder de statusbalk.
  expect(style.appPaddingTop).toBe(`${INSET}px`)

  // Bovenaan: geen lijntje.
  const backdrop = page.locator(BACKDROP)
  await expect(backdrop).not.toHaveClass(/is-scrolled/)
  await checkLayout(page, errors, 'status-bar-top', { fullPage: false })

  // Gescrold: wel.
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect(backdrop).toHaveClass(/is-scrolled/)
  expect(await backdrop.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe(
    '1px',
  )
  await checkLayout(page, errors, 'status-bar-scrolled', { fullPage: false })

  // Terug naar boven: weer weg.
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(backdrop).not.toHaveClass(/is-scrolled/)
})

test('strook: na een routewissel klopt is-scrolled met de nieuwe scrollstand', async ({ page }) => {
  await page.goto(`/recepten/${recipe.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 400))
  const backdrop = page.locator(BACKDROP)
  await expect(backdrop).toHaveClass(/is-scrolled/)

  // Via het menu (onderaan, vast) naar de boodschappenlijst.
  await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link').nth(3).click()
  await expect(page).toHaveURL(/\/boodschappen$/)
  // De (lege) boodschappenlijst is korter dan het scherm: de browser zet de scrollstand op 0.
  // De router zelf scrolt niet (geen scrollBehavior); de observer volgt de echte stand.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(backdrop).not.toHaveClass(/is-scrolled/)
})
