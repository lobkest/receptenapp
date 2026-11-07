import { test, expect } from '@playwright/test'
import { RAILS_URL } from './env.js'
import { deleteRecipe } from './traits.js'
import { checkLayout, collectErrors, postRecipe } from './helpers.js'

// Bovenaan de pagina (main.css): de effen strook achter de statusbalk (#status-bar-backdrop)
// en --top-inset, waar de inhoud begint. In de geïnstalleerde iOS-app ligt --top-inset
// lager, onder de iOS 26-blur. Die blur zelf toont Playwright niet; dat controleer je op
// een iPhone.
//
// Chromium heeft geen notch: env(safe-area-inset-top) is daar 0. Via CDP doen we alsof er
// een statusbalk van 47 px is (iPhone 13), zodat de strook ook echt op de screenshot staat.
// Chromium kent ook geen display-mode: standalone in combinatie met -webkit-touch-callout
// (dat is alleen WebKit). Daarom lezen we de standalone-waarde van --top-inset uit de echte
// CSS-regel en zetten we hem zelf op :root, voor de screenshot van die variant.
const INSET = 47
const IOS_OFFSET = 28
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

async function openRecipe(page) {
  await fakeNotch(page)
  await page.goto(`/recepten/${recipe.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

function backdropStyle(page) {
  return page.locator(BACKDROP).evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      parentIsBody: element.parentElement === document.body,
      position: style.position,
      background: style.backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      opacity: style.opacity,
      backdropFilter: style.backdropFilter,
      top: box.top,
      height: box.height,
      width: box.width,
    }
  })
}

// Afstand van de bovenrand van het scherm tot de padding van #app en tot de h1.
function topDistances(page) {
  return page.evaluate(() => ({
    appPaddingTop: parseFloat(getComputedStyle(document.getElementById('app')).paddingTop),
    h1Top: document.querySelector('h1').getBoundingClientRect().top,
  }))
}

// De waarde van --top-inset uit @supports (-webkit-touch-callout: none) { @media
// (display-mode: standalone) { :root { … } } } in main.css, of null.
function standaloneTopInset(page) {
  return page.evaluate(() => {
    const rules = (list) => Array.from(list ?? [])
    for (const sheet of document.styleSheets) {
      for (const supports of rules(sheet.cssRules)) {
        if (!(supports instanceof CSSSupportsRule)) continue
        if (!supports.conditionText.includes('-webkit-touch-callout')) continue
        for (const media of rules(supports.cssRules)) {
          if (!(media instanceof CSSMediaRule)) continue
          if (!media.conditionText.includes('standalone')) continue
          for (const rule of rules(media.cssRules)) {
            const value = rule.style?.getPropertyValue('--top-inset')
            if (rule.selectorText === ':root' && value) return value.trim()
          }
        }
      }
    }
    return null
  })
}

test('strook: vast, schermbreed, ondoorzichtig en zo hoog als de statusbalk', async ({ page }) => {
  const errors = collectErrors(page)
  await openRecipe(page)

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

  // Buiten de geïnstalleerde iOS-app (hier: Chromium) begint de inhoud direct onder de
  // statusbalk, zoals voorheen.
  const { appPaddingTop } = await topDistances(page)
  expect(appPaddingTop).toBe(INSET)
  await checkLayout(page, errors, 'status-bar-top', { fullPage: false })

  // Gescrold: de inhoud schuift onder de dekkende strook.
  await page.evaluate(() => window.scrollTo(0, 400))
  await checkLayout(page, errors, 'status-bar-scrolled', { fullPage: false })
})

test('strook: in de geïnstalleerde iOS-app begint de inhoud onder de iOS-blur', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openRecipe(page)

  const value = await standaloneTopInset(page)
  expect(value, 'regel voor standalone + -webkit-touch-callout in main.css').toContain(
    'var(--ios-edge-blur-offset)',
  )
  // Doen alsof de regel geldt: dezelfde waarde direct op :root.
  await page.evaluate((topInset) => {
    document.documentElement.style.setProperty('--top-inset', topInset)
  }, value)

  const { appPaddingTop } = await topDistances(page)
  expect(appPaddingTop).toBe(INSET + IOS_OFFSET)
  // De strook zelf blijft precies de statusbalk.
  expect((await backdropStyle(page)).height).toBe(INSET)
  await checkLayout(page, errors, 'status-bar-standalone', { fullPage: false })
})
