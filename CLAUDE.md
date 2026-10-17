# Receptenapp

Rails 8.1 API-only app (Ruby 3.4, PostgreSQL, Minitest), live op Render met Neon.
De eigenaar is Rails-beginner: leg uit in het Nederlands, vergelijk met Flask of Spring.

## Regels
- Commit en push NOOIT, en maak geen branches. De eigenaar doet dat zelf.
- Bij een duidelijk plan dat niet afwijkt van de opdracht: direct uitvoeren, zonder op
  akkoord te wachten. Alleen stoppen en vragen bij afwijkingen, onduidelijkheden,
  onomkeerbare acties of als er sudo nodig is.
- Commitberichten (als voorstel in het rapport) volledig in kleine letters.
- Raak productieconfiguratie (config/environments/production.rb, config/database.yml,
  config/cache.yml, config/cable.yml, bin/render-build.sh) niet aan zonder expliciete toestemming.
- Test zelf zo volledig mogelijk; de eigenaar test niet zelf. Draai na wijzigingen
  `bin/rails test` en `bin/rubocop`, en bij frontendwijzigingen ook `npx vitest run` en
  `npm run test:e2e` (in frontend/). Bekijk de Playwright-screenshots in
  frontend/e2e/screenshots/ en beschrijf wat je ziet.
- Draai voor elk rapport ook alle CI-commando's uit .github/workflows/ lokaal, precies
  zoals CI ze draait (zelfde commando's, zelfde map, op de hele map en niet alleen op src/).
  Nu zijn dat: `bin/brakeman --no-pager`, `bin/bundler-audit`, `bin/rubocop -f github`,
  `RAILS_ENV=test bin/rails db:test:prepare test`, en in frontend/: `npm ci`,
  `npx oxlint . && npx eslint . && npx prettier --check .`, `npm run test:unit -- --run`,
  `npm run build`.
  Rapporteer per CI-job of hij slaagt.
