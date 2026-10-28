import { test, expect } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import process from 'node:process'
import { RAILS_URL } from './env.js'

// Een nieuwe deploy terwijl de app al geïnstalleerd is: de service worker heeft de oude
// versie bewaard. Bij opnieuw openen moet de nieuwe service worker meteen actief worden en
// de pagina zelf herladen met de nieuwe bundel, niet blijven wachten tot alle tabbladen
// dicht zijn (dat deed hij eerst: zonder skipWaiting in vite.config.js bleef de nieuwe
// versie eeuwig op "waiting" staan).
//
// Twee builds (APP_VERSION A en B, dus andere bundels) in een eigen map, met een eigen
// vite preview, zodat dist-e2e en de andere specs er geen last van hebben.

const PORT = 5176
const URL = `http://localhost:${PORT}`
const OUT_DIR = 'dist-e2e-update'

function build(version) {
  execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], {
    env: { ...process.env, APP_VERSION: version, API_TARGET: RAILS_URL, E2E: '1' },
    stdio: 'ignore',
  })
}

// Welke bundel deze pagina draait (assets/index-<hash>.js).
function bundleOf(page) {
  return page.evaluate(() =>
    [...document.scripts].map((s) => s.src).find((src) => src.includes('/assets/index-')),
  )
}

let server

test.beforeAll(async () => {
  test.setTimeout(120_000)
  build('versie-a')
  server = spawn(
    'npx',
    ['vite', 'preview', '--outDir', OUT_DIR, '--port', `${PORT}`, '--strictPort'],
    {
      env: { ...process.env, API_TARGET: RAILS_URL },
      stdio: 'ignore',
    },
  )
  await expect
    .poll(
      () =>
        fetch(URL).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
})

test.afterAll(() => {
  server?.kill()
  rmSync(OUT_DIR, { recursive: true, force: true })
})

test('nieuwe deploy: bij opnieuw openen komt de nieuwe versie, zonder tabbladen te sluiten', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(`${URL}/boodschappen`)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const oldBundle = await bundleOf(page)

  // Nieuwe deploy, daarna de app opnieuw openen. Eerst komt de bewaarde (oude) versie
  // (zo werkt hij ook offline en bij een slapende server meteen); de nieuwe service worker
  // neemt het over en herlaadt de pagina.
  build('versie-b')
  await page.goto(`${URL}/boodschappen`)
  await expect.poll(() => bundleOf(page), { timeout: 15_000 }).not.toBe(oldBundle)
  await expect(page.getByRole('heading', { name: 'Boodschappen' })).toBeVisible()
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return { waiting: registration.waiting != null }
  })
  expect(state.waiting).toBe(false)
})
