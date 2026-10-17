# Receptenapp

Recepten, een gedeelde boodschappenlijst en wat je in huis hebt, voor iedereen met de link.
Rails 8.1 API (Ruby 3.4, PostgreSQL) met een Vue 3-frontend in `frontend/`. Live op Render,
met Neon als database.

Hoe de code in elkaar zit, met vergelijkingen met Flask en Spring: [docs/code_overzicht.md](docs/code_overzicht.md).
Eerdere bevindingen en wat ermee gedaan is: [docs/code_review.md](docs/code_review.md).

## Lokaal draaien

```sh
bin/setup --skip-server   # gems en database klaarzetten
bin/dev                   # Rails op poort 3000
cd frontend && npm ci && npm run dev   # Vite op poort 5173, stuurt /api door naar Rails
```

## Testen

Dezelfde commando's als CI (`.github/workflows/ci.yml`):

```sh
bin/brakeman --no-pager
bin/bundler-audit
bin/rubocop -f github
RAILS_ENV=test bin/rails db:test:prepare test

cd frontend
npm ci
npx oxlint . && npx eslint . && npx prettier --check .
npm run test:unit -- --run
npm run build
npm run test:e2e          # Playwright op een iPhone-scherm; screenshots in e2e/screenshots/
```
