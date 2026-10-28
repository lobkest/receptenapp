# Receptenapp

Rails 8.1 API-only app (Ruby 3.4, PostgreSQL, Minitest), live op Render met Neon.
De eigenaar is Rails-beginner: leg uit in het Nederlands, vergelijk met Flask of Spring.

## Oriëntatie
- Zoek eerst in docs/code_overzicht.md, hoofdstuk 7 ("Waar moet ik zijn als ik X wil
  aanpassen?") en de flows in hoofdstuk 6, welke bestanden en tests bij het onderdeel horen,
  in plaats van de code af te zoeken. Verander je welke bestanden of endpoints een onderdeel
  gebruikt, werk dan die rij of flow bij.

## Regels
- Commit en push NOOIT, en maak geen branches. De eigenaar doet dat zelf.
- Bij een duidelijk plan dat niet afwijkt van de opdracht: direct uitvoeren, zonder op
  akkoord te wachten. Alleen stoppen en vragen bij afwijkingen, onduidelijkheden,
  onomkeerbare acties of als er sudo nodig is.
- Commitberichten (als voorstel in het rapport) volledig in kleine letters.
- Raak productieconfiguratie (config/environments/production.rb, config/database.yml,
  config/cache.yml, config/cable.yml, bin/render-build.sh) niet aan zonder expliciete toestemming.
- Test zelf zo volledig mogelijk; de eigenaar test niet zelf. Bij frontendwijzigingen ook
  `npm run test:e2e` (in frontend/). Bekijk de Playwright-screenshots in
  frontend/e2e/screenshots/ en beschrijf wat je ziet.
- Draai voor elk rapport `CI_LOG_DIR=<scratchpad>/ci bin/ci-local`: alle jobs uit
  .github/workflows/ met dezelfde commando's in dezelfde map, met per job ✅/❌ en de
  foutregels. Rapporteer per CI-job of hij slaagt. `npm ci` slaat het script over als
  frontend/package-lock.json ongewijzigd is; bij een gewijzigde lockfile draait het wel
  (`--npm-ci` forceert). Wijzigt .github/workflows/, werk dan bin/ci-local bij.
  (bin/ci is de lokale CI van Rails zelf en draait andere stappen: niet gebruiken.)

## Testen en efficiëntie
- Testvolgorde: eerst alleen gewijzigde testbestanden (`bin/rails test <bestand>`,
  `npx vitest run <bestand>`), dan `npx playwright test --last-failed --retries=0 --reporter=line`; de volledige e2e-suite maximaal één keer, aan het eind.
- Controleer vóór e2e met `pgrep -af "playwright test|puma" | cut -c1-120` of er al een run draait. Zo ja: stop en meld het, wacht niet in een lus.
- Testoutput altijd naar een bestand in de scratchpad, daarna alleen fouten tonen (grep op "Error|Expected|Received|failed").
- Nooit `ps aux`, `ps -ef` of `cat` van hele bestanden; gebruik grep met context en `cut -c1-150`.
- Een falende e2e-test eerst één keer los draaien met `--retries=0` voordat je volgfouten in andere specs analyseert.
- Vóór lint of bin/ci-local: `npx prettier --write <gewijzigde bestanden>` (in frontend/) en
  `bin/rubocop -a <gewijzigde bestanden>`.
- Nieuwe tests: geen exacte volledige tag-lijsten, maar controleer de specifieke tag(s) die de test bewijst.
- Nieuwe tests: zoek elementen op rol, aria-attribuut (`aria-pressed`, `aria-label`) of klasse,
  niet op zichtbare tekst, tenzij de tekst zelf is wat de test bewijst. Zo raakt een
  tekstwijziging in de UI niet tien specs.
- Gebruik de gedeelde testhulpjes in plaats van ze per spec te kopiëren: e2e/helpers.js
  (Playwright: collectErrors, checkLayout, ingredientRow, API-hulpjes), src/__tests__/mount.js
  (vitest: mountRoute, buttonWithText, listLines), src/__tests__/helpers.js (nep-API's) en
  test/test_helper.rb (Rails: count_queries, TaskTestHelper). Heeft een tweede spec iets
  nodig dat al in een andere spec staat, verplaats het dan naar zo'n gedeeld bestand.
- Laat een nep-endpoint reageren op wat gevraagd wordt (body), niet altijd hetzelfde
  antwoord geven.