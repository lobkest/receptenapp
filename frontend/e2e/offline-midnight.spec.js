import { test, expect } from '@playwright/test'
import { checkLayout, collectErrors, iphone, openOnline } from './helpers.js'

// "kopie van vandaag 23:30" moet na middernacht vanzelf "kopie van gisteren 23:30" worden,
// ook als de app al die tijd open staat (OfflineNotice rekent met composables/useNow.js).
// De klok van de pagina is nep (page.clock); de tijdzone vast, zodat 23:30 ook lokaal 23:30 is.

test('de app blijft open over middernacht: vandaag wordt gisteren', async ({ browser }) => {
  test.setTimeout(60_000)
  const { context, page } = await iphone(browser, { timezoneId: 'Europe/Amsterdam' })
  const errors = collectErrors(page, { ignoreFailedLoads: true })
  await page.clock.install({ time: new Date('2026-11-03T23:30:00+01:00') })

  // Online openen om 23:30: de kopie krijgt dat tijdstip (Date.now() op de telefoon).
  await openOnline(page)
  await page.clock.pauseAt(new Date('2026-11-03T23:31:00+01:00'))
  await context.setOffline(true)
  const detail = page.locator('main .offline-notice .offline-detail')
  await expect(detail).toHaveText(/^kopie van vandaag 23:3\d$/)
  const time = (await detail.textContent()).match(/\d\d:\d\d$/)[0]

  // 40 minuten later, zonder iets aan te raken: de timers lopen door (useNow tikt).
  await page.clock.fastForward('40:00')
  await expect(detail).toHaveText(`kopie van gisteren ${time}`)
  await checkLayout(page, errors, 'offline-melding-na-middernacht', { scrollTop: true })
  await context.close()
})
