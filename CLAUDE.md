# Receptenapp

Rails 8.1 API-only app (Ruby 3.4, PostgreSQL, Minitest), live op Render met Neon.
De eigenaar is Rails-beginner: leg uit in het Nederlands, vergelijk met Flask of Spring.

## Regels
- Commit en push NOOIT. De eigenaar doet dat zelf.
- Leg eerst je plan uit en wacht op akkoord voordat je bestanden wijzigt.
- Raak productieconfiguratie (config/environments/production.rb, config/database.yml,
  config/cache.yml, config/cable.yml, bin/render-build.sh) niet aan zonder expliciete toestemming.
- Draai na wijzigingen `bin/rails test` en `bin/rubocop`.
