# Code review receptenapp

Stand van 14 oktober 2026 (commit `5fd7d55`). Alleen gelezen en gemeten, niets gewijzigd.

> **Bijgewerkt na refactorblok 1** (bugs, veiligheid, opruimen). Afgerond: ✅ B1, ✅ B5, ✅ D1/I9, ✅ F6, ✅ T1; deels: 🟡 B3, 🟡 B8, 🟡 T4. Vervallen: ⛔ B2 en stap 10 (geen wijzigingen aan de productieconfiguratie). Zie de markeringen bij elk punt en in de top 10.
>
> **Bijgewerkt na refactorblok 2** (één bron van waarheid). Afgerond: ✅ I1, ✅ B3, ✅ B4, ✅ T2, ✅ top-10 stap 2 en 3; deels: 🟡 B11, 🟡 T5. Nieuw: B17 (rate limit en X-Forwarded-For op Render; ✅ afgerond na meting, zie B17). Correctie: T3 was al gedekt.
>
> **Bijgewerkt na refactorblok 3** (dubbele code, puur refactoren). Afgerond: ✅ B6, ✅ B8, ✅ F1, ✅ F2, ✅ I5, ✅ top-10 stap 7; deels: 🟡 F3, 🟡 top-10 stap 5 en 6. Gedrag gelijk: alle bestaande tests groen zonder aangepaste verwachtingen; screenshots vóór en na zijn pixel voor pixel gelijk (op tijdstempels na).

**Legenda** – prioriteit: **hoog** / **middel** / **laag**; moeite: **klein** (< 1 uur), **middel** (een dagdeel), **groot** (meer dan een dag).
Regelnummers in de oorspronkelijke bevindingen verwijzen naar de stand van commit `5fd7d55`; door de refactorblokken kunnen ze nu verschoven zijn.

---

## 0. Meetresultaten

Alle CI-commando's uit `.github/workflows/ci.yml` zijn lokaal gedraaid, precies zoals CI dat doet, plus Playwright.

| Check | Commando | Uitkomst |
|---|---|---|
| Brakeman | `bin/brakeman --no-pager` | ✅ 0 waarschuwingen, 0 fouten |
| bundler-audit | `bin/bundler-audit` | ✅ geen kwetsbaarheden |
| RuboCop | `bin/rubocop -f github` | ✅ geen overtredingen |
| Rails-tests | `RAILS_ENV=test bin/rails db:test:prepare test` | ✅ 235 runs, 1581 assertions, 0 failures/errors/skips |
| npm ci | `npm ci` (frontend/) | ✅ |
| Lint | `npx oxlint . && npx eslint .` | ✅ |
| Vitest | `npm run test:unit -- --run` | ✅ 22 bestanden, 267 tests |
| Build | `npm run build` | ✅ |
| Playwright | `npm run test:e2e` | ✅ 20 tests geslaagd |

Algemeen beeld: de code is netjes, goed becommentarieerd en zeer goed getest. De bevindingen hieronder gaan vooral over **dubbele code en verschillen tussen de onderdelen die tegelijk zijn gebouwd**, niet over kapotte functionaliteit.

---

## 1. Backend

### B1. Beheer-endpoints hebben geen rate limit – **hoog**, moeite **klein** – ✅ afgerond
> Opgelost met `rate_limit to: 10, within: 1.minute, scope: "admin"` in `Api::Admin::BaseController`. Het is één teller per IP voor alle beheer-endpoints samen. Elk verzoek telt mee, ook die met de goede code, en de 11e krijgt een 429 met een Nederlandse melding (`admin.rate_limited`). Instelbaar via `ADMIN_REQUESTS_PER_MINUTE`. Getest in `test/controllers/api/admin/recipes_controller_test.rb` en in de e2e-test `beheer: te veel pogingen geeft een 429 met melding`.
- **Wat/waar**: `app/controllers/api/admin/base_controller.rb:9-21` controleert de beheercode met `secure_compare`, maar er is geen `rate_limit` (grep op `rate_limit` in `app/controllers/api/admin/` vindt niets). Alle openbare schrijfacties hebben er wel een (`app/controllers/concerns/public_write_rate_limit.rb`).
- **Waarom**: iemand kan onbeperkt codes proberen tegen bijvoorbeeld `GET /api/admin/deletion_requests`. Hoe groot het risico is, hangt af van de lengte van `ADMIN_TOKEN`; dat heb ik niet kunnen zien.
- **Voorstel**: in `Api::Admin::BaseController` een `rate_limit to: 10, within: 1.minute` op alle acties, met een JSON-429 zoals in `PublicWriteRateLimit`. Test toevoegen in `test/controllers/api/admin/recipes_controller_test.rb`.

### B2. Rate limiting in productie gebruikt `:memory_store` – **middel**, moeite **klein** (vereist jouw toestemming) – ⛔ vervallen (geen wijzigingen aan de productieconfiguratie)
- **Wat/waar**: `config/environments/production.rb:48` zet `config.cache_store = :memory_store`. Rails' `rate_limit` bewaart zijn tellers in `Rails.cache`.
- **Waarom**: de tellers gelden per proces en zijn weg na elke herstart of deploy. Draait Puma met meerdere workers, dan heeft elke worker zijn eigen teller, en is de echte limiet dus hoger dan ingesteld.
- **Voorstel**: `:solid_cache_store` gebruiken (de gem en `db/cache_schema.rb` staan er al). Dit is productieconfiguratie: **alleen met jouw expliciete toestemming**.

### B3. Foutresponses hebben drie vormen en twee talen – **middel**, moeite **middel** – ✅ afgerond (blok 2)
> Blok 2: elke fout is nu `{ "error": "<Nederlandse melding>", "errors": { "<veld>": ["…"] } }`, ook 400, 401, 404, 409 en 429. De bulk-insert noemt de regel in de veldnaam (`shopping_list_items[2].name`) in plaats van een los `index`. Alle teksten staan in `config/locales/nl.yml` (`api.*`, `admin.*`). `client.js` leest dit op één plek uit; een 500 toont nooit de servertekst.
>
> Blok 1:
> Gedaan: alle 422- en 429-teksten komen nu in het Nederlands uit `config/locales/nl.yml` (`api.*` en `admin.*`), en `client.js` toont `body.error` bij 422 en 429 als die er is. Nog open: de 404- en 401-teksten zijn nog Engels (de frontend toont die niet), en `{ index, errors }` van de bulk-insert wordt nog niet gebruikt.
- **Wat/waar**:
  - `{ error: "..." }` in het Engels: `api/recipes_controller.rb:13` en `:95`, `api/recipe_variations_controller.rb:19` en `:61`, `api/shopping_list_items_controller.rb:83` en `:110`, `api/standard_items_controller.rb:46` en `:79`, `api/not_found_controller.rb:4`, `api/admin/base_controller.rb:25` en `:29`, `concerns/public_write_rate_limit.rb:19`.
  - `{ error: "..." }` in het Nederlands via I18n: alleen de 409's (`config/locales/nl.yml:116-118`).
  - `{ errors: { veld: [...] } }` bij validatiefouten, met Nederlandse teksten uit rails-i18n.
  - `{ index:, errors: }` bij een mislukte bulk-insert (`shopping_list_items_controller.rb:99`).
- **Waarom**: de frontend (`frontend/src/api/client.js:38-63`) gooit de servertekst bij 404, 422 en 429 weg en toont een vaste Nederlandse melding. Gevolg: een 422 zonder `errors` (bijvoorbeeld "Servings must be between 1 and 50" uit `recipe_variations_controller.rb:61`) wordt "Controleer de ingevulde velden." zonder dat een veld rood wordt. Het `index` van de bulk-insert wordt nergens gebruikt.
- **Voorstel**: één vorm afspreken (`{ error: "<Nederlandse tekst>" }` voor algemene fouten, `{ errors: {...} }` voor veldfouten). Teksten in `config/locales/nl.yml`. `client.js` laten terugvallen op `body.error` als die er is.

### B4. RecordNotFound wordt op vijf manieren afgehandeld – **middel**, moeite **klein** – ✅ afgerond
> Eén concern `app/controllers/concerns/api_errors.rb` in `ApplicationController` met `rescue_from` voor `RecordNotFound` ("Recept niet gevonden.", met de modelnaam uit `nl.yml`), `RecordInvalid`, `StaleObjectError`, `ParameterMissing` en `TooManyRecords`. De vijf losse afhandelingen en de `render_errors`-methodes per controller zijn weg.
- **Wat/waar**: eigen `rescue_from ActiveRecord::RecordNotFound` in `api/recipes_controller.rb:15`, `api/recipe_variations_controller.rb:18-20`, `api/shopping_list_items_controller.rb:13`, `api/standard_items_controller.rb:9` en `api/admin/base_controller.rb:6`. Elk heeft een eigen tekst.
- **Voorstel**: één `rescue_from` in `ApplicationController` (zoals daar al gebeurt voor `TooManyRecords`, `application_controller.rb:3-5`), met een I18n-tekst. Mag samen met B3.

### B5. Versie terugzetten kan een 500 geven – **middel**, moeite **klein** – ✅ afgerond (met correctie)
> **Correctie**: het was geen 500. Rails zet `ActiveRecord::RecordInvalid` standaard om in een 422, en `StaleObjectError` in een 409 (`config.action_dispatch.rescue_responses`). Die 422 had wel geen bruikbare melding, en de versie werd niet teruggezet. De echte oorzaak, gevonden met een reproductietest: bij een versie van vóór de variaties (zonder `"variations"` in het snapshot) houdt `restore_version!` de huidige variaties. Hun tagwijzigingen ("− vega") pasten dan niet bij de teruggezette tags, de validatie faalde, en de hele transactie werd teruggedraaid. Fix: `Recipe#restore_variations!` laat tagwijzigingen weg die niet meer passen, zoals `link_tags` dat bij een gewone bewerking al deed. De admin-basecontroller geeft nu bovendien een Nederlandse 422 (`admin.restore_failed`) en een 409 terug.
- **Wat/waar**: `api/admin/recipe_versions_controller.rb:18-23` roept `@recipe.restore_version!` aan, die `save!` en `update!` gebruikt (`app/models/recipe.rb:120` en `:143`). `Api::Admin::BaseController` vangt alleen `RecordNotFound` af.
- **Waarom**: een snapshot die niet meer door de huidige validaties komt (een regel die later is aangescherpt), of een gelijktijdige bewerking (`StaleObjectError`), levert een 500 op in plaats van een 422 of 409.
- **Voorstel**: `rescue_from ActiveRecord::RecordInvalid` en `StaleObjectError` in de admin-basecontroller, plus een test.

### B6. Tagnamen normaliseren en controleren staat er drie keer – **middel**, moeite **middel** – ✅ afgerond (backend)
> Concern `app/models/concerns/tag_names.rb` (`normalize_tag_names`, `validate_tag_names`) in Recipe en RecipeVariation. De frontend (`TagPicker.vue`) normaliseert nog apart, om direct te laten zien dat een tag dubbel is.
- **Wat/waar**:
  - normaliseren: `app/models/recipe.rb:41` (`tagged_with_all`), `recipe.rb:91` (`tag_names=`), `app/models/recipe_variation.rb:115-117` (`normalize_tag_names`);
  - te lang of met komma: `recipe.rb:182-189` en `recipe_variation.rb:145-157`;
  - in de frontend nog een keer: `frontend/src/components/TagPicker.vue:31-33`, met maxima als losse getallen (`TagPicker.vue:12` en `:17`).
- **Voorstel**: `Tag.normalize_names(names)` en een `Tag.name_errors(name)` (of een kleine concern `TagNameList`) waar Recipe en RecipeVariation allebei gebruik van maken.

### B7. Optimistic locking en "eerste versie bewaren" staan dubbel in Recipe en RecipeVariation – **laag**, moeite **klein**
- **Wat/waar**: `touch_for_locking` in `recipe.rb:152-154` en `recipe_variation.rb:183-185`; "Oorspronkelijke versie" in `recipe.rb:156-158` en `recipe_variation.rb:188-190`.
- **Voorstel**: een concern `TouchesForLocking` (één `before_save`). Het versiebeheer zou als concern `Versioned` kunnen, al is het verschil tussen recept en variatie zo groot dat dat niet per se winst oplevert.

### B8. Hoeveelheid plus eenheid is drie keer apart geïmplementeerd – **middel**, moeite **middel** – ✅ afgerond
> Concern `app/models/concerns/has_quantity.rb` met de macro's `unit_enum` en `has_quantity` (komma, eenheid wissen zonder hoeveelheid, validaties, `UNITS`, `MAX_QUANTITY`). Twee macro's, zodat elk model zijn foutmeldingen in dezelfde volgorde houdt; `ShoppingListItem` houdt zijn `inclusion`-controle (`unit_inclusion: true`). Vóór en na vergeleken op 14 soorten ongeldige invoer: identieke fouten, ook in volgorde.
- **Wat/waar**:
  - `enum :unit` met dezelfde drie waarden: `app/models/recipe_ingredient.rb:11` en `app/models/variation_change.rb:14`. `ShoppingListItem` gebruikt een `inclusion`-validatie (`shopping_list_item.rb:20`).
  - "eenheid leegmaken zonder hoeveelheid": `recipe_ingredient.rb:37-39`, `variation_change.rb:44-46` en in `shopping_list_item.rb:29-34`.
  - dezelfde `numericality`-validatie in drie modellen.
  - De database dwingt eenheid en hoeveelheid af voor `recipe_ingredients` en `variation_changes` (`db/schema.rb:34-36` en `:131-135`), maar **niet** voor `shopping_list_items` (`db/schema.rb:82-92`).
- **Voorstel**: een concern `HasQuantity` (enum, `decimal_comma`, leegmaken, validaties) en een migratie met dezelfde check constraints op `shopping_list_items`.

### B9. Normaliseren gebeurt op twee manieren – **laag**, moeite **klein**
- **Wat/waar**: `normalizes` in `ingredient.rb:8`, `tag.rb:9` en `variation_change.rb:20`; een `before_validation` in `shopping_list_item.rb:29-34` en `standard_item.rb:12-15`.
- **Waarom**: `normalizes` geldt ook voor `find_by(name:)` en `where(name:)`; `before_validation` niet. `StandardItem.find_by(name: " Melk ")` vindt daardoor niets, `Tag.find_by(name: " Vega ")` wel.
- **Voorstel**: overal `normalizes` gebruiken.

### B10. `Recipe` is een zwaar model – **laag**, moeite **middel**
- **Wat/waar**: `app/models/recipe.rb` (221 regels): tags koppelen, stappen nummeren, rijen tellen, versies bijhouden en terugzetten (`restore_version!` en `restore_variations!`, `recipe.rb:103-149`).
- **Waarom**: fat model is in Rails beter dan een fat controller, maar het terugzetten is een losse use case met eigen regels.
- **Voorstel**: `restore_version!` naar een plain Ruby-object `RecipeVersion::Restore` (in `app/models/recipe_version/restore.rb`). Pas doen als er nog meer bij komt.

### B11. Controllers zijn dun, op twee plekken na – **laag**, moeite **klein** – 🟡 deels
> "Op lijst" zit nu in het form object `ShoppingListAddition` en de concern `AddsToShoppingList`; beide controlleracties zijn één regel. `create_many` in `ShoppingListItemsController` staat er nog.
- `ShoppingListItemsController#create_many` (`shopping_list_items_controller.rb:81-103`) en `RecipeVariationsController#add_to_shopping_list` (`recipe_variations_controller.rb:58-70`) doen allebei "veel regels in één transactie". Voorstel: `ShoppingListItem.create_all!(list)` in het model en die op beide plekken gebruiken.
- `Api::RecipesController` gebruikt `Api::RecipeVariationsController::FIELDS` (`recipes_controller.rb:77` en `:87`). Een controller die van een andere afhangt is ongebruikelijk. Beter: `RecipeVariation::PERMITTED_ATTRIBUTES`.

### B12. Strong parameters – in orde
`params.expect` (Rails 8) wordt overal gebruikt, met aparte `create_params` en `update_params` (`recipes_controller.rb:73-88`). `lock_version` is verplicht bij een update (`recipes_controller.rb:47`, `recipe_variations_controller.rb:39`). Een kleinigheid: `rescue_from ActiveRecord::RecordInvalid` in `recipes_controller.rb:17` zet `@recipe = error.record`. Is dat record een `Tag` (uit `Tag.named`), dan stuurt de API de fouten van de tag terug alsof het om het recept gaat. **laag**.

### B13. N+1-queries – geen gevonden
`index` gebruikt `includes(:tags)` (`recipes_controller.rb:22`), `show` en `update` gebruiken `with_details` (`recipe.rb:35`), de beheerlijst `includes(:recipe)` (`deletion_requests_controller.rb:8`). `RecipeVersion.snapshot_of` laadt het recept bij elke opslag opnieuw met al zijn relaties (`recipe_version.rb:28`). Dat is bewust en voor deze aantallen prima.

### B14. Dode code en verouderde commentaren – **laag**, moeite **klein**
- `app/models/concerns/deletion_requestable.rb:5`: "meant for recipe variations later on as well". `RecipeVariation` gebruikt het al (`recipe_variation.rb:10`).
- `config/application.rb:3` laadt `rails/all` (Active Storage, Action Mailer, Action Cable, Action Text), terwijl de app daar niets van gebruikt. Hetzelfde geldt voor `app/mailers/`, `app/views/layouts/mailer.*`, `app/jobs/`, de gem `image_processing` (`Gemfile:33`), Kamal (`Gemfile:27`, `config/deploy.yml`, `.kamal/`; jullie deployen op Render) en solid_queue/solid_cable (productie gebruikt `:async` en `:memory_store`). Opruimen raakt deels productieconfiguratie (`cable.yml`, `cache.yml`), dus **alleen met toestemming**.
- `db/seeds.rb` is leeg. Wat voorbeeldrecepten zouden lokaal ontwikkelen makkelijker maken.

### B15. Wat open is, en of dat zo hoort
Bewust open (zie de commentaren in `config/routes.rb:170` en `:183`): recepten en variaties toevoegen en bewerken, verwijderen *aanvragen*, de boodschappenlijst en de standaardlijst (ook "Alles wissen"). Twee gevolgen om je bewust van te zijn:
- Iedereen kan met `POST /api/recipes/:id/request_deletion` alle recepten in één keer verbergen (begrensd door 120 schrijfacties per minuut per IP). De beheerder moet ze daarna één voor één terugzetten; terugzetten in bulk bestaat niet. **middel**, als het ooit misbruikt wordt.
- `FrontendController` gebruikt `html_safe` op `index.html` (`frontend_controller.rb:10`). Dat is veilig, want het bestand komt uit je eigen build (Brakeman meldt ook niets).
- De beheercode staat in `sessionStorage` (`frontend/src/stores/admin.js:5-27`) en gaat alleen in de `Authorization`-header (`frontend/src/api/admin.js:8-13`). Dat is goed.

### B16. Naamgeving – in orde
Code, tabellen en routes zijn Engels; UI, frontend-routes (`/recepten`, `/boodschappen`) en foutteksten via I18n zijn Nederlands. Commentaar is Engels in de backend en Nederlands in de frontend. Dat is consequent per laag, dus geen actie nodig.

### B17. Rate limit en X-Forwarded-For op Render – ✅ afgerond (meting 15 oktober, fix in code; nog na te meten na deploy)
> **Meting** (live, foute code, alleen lezen): 11 verzoeken met vervalst `X-Forwarded-For` én 11 zonder gaven allemaal 401, nooit 429. Verklaring: scenario C plus workers. Rails vertrouwt de Cloudflare-servers (172.64.0.0/13) niet als proxy, dus `remote_ip` was het Cloudflare-adres, en elke Puma-worker had zijn eigen `memory_store`-teller. Spoofen via X-Forwarded-For kon niet, maar de limiet werkte per Cloudflare-server in plaats van per bezoeker.
> **Fix**: `WEB_CONCURRENCY=0` op Render (door de eigenaar). Puma 8 draait dan in single mode: één proces, dus één `memory_store`-teller; zie `puma_options_from_env` en `Launcher#clustered?` in de gem, `config/puma.rb` zet zelf geen workers. Daarnaast `app/controllers/concerns/client_ip.rb`: `CF-Connecting-IP`, anders `request.remote_ip`, als `by:` in alle drie de limieten: beheer, `PublicWriteRateLimit` en de inzendlimiet voor recepten (scope en aantallen gelijk). Tests: `test/controllers/api/client_ip_rate_limit_test.rb`.
> **Aanname**: al het verkeer loopt via Cloudflare. Is de app ooit zonder Cloudflare bereikbaar, dan kan een client per verzoek een andere `CF-Connecting-IP` sturen en is de limiet zwakker dan per `remote_ip`.
>
> **Open punt (bewust nog niet gedaan, besluit eigenaar 15 oktober)** – prioriteit **middel**, moeite **klein**: `CF-Connecting-IP` alleen geloven als `request.remote_ip` in de Cloudflare-bereiken valt (https://www.cloudflare.com/ips-v4/ en `/ips-v6/`). Bij directe toegang buiten Cloudflare om is `remote_ip` dan het echte adres en telt de header niet mee. Nadeel: de lijst met Cloudflare-bereiken moet bijgehouden worden.
- **Wat**: `rate_limit` gebruikt `request.remote_ip`, niet de ruwe header (`by: -> { request.remote_ip }` in actionpack, `rate_limiting.rb`). `remote_ip` (`ActionDispatch::RemoteIp`) loopt X-Forwarded-For van rechts naar links af, slaat vertrouwde adressen over (localhost en privé-reeksen; de app stelt geen eigen `trusted_proxies` in) en neemt het eerste andere adres.
- **Lokaal nagerekend** met `REMOTE_ADDR` 10.0.0.5:
  - A. Render zet het echte IP **achteraan** (`vervalst, echt`): `remote_ip` = echt → veilig.
  - B. Render zet het echte IP **vooraan** en laat het meegestuurde erachter staan (`echt, vervalst`): `remote_ip` = vervalst → **de limiet is te omzeilen**.
  - C. Render zet er een **publiek** proxy-IP achter (`vervalst, echt, proxy`): `remote_ip` = proxy → geen omzeiling, maar alle bezoekers achter dezelfde proxy delen één teller.
- **Niet geverifieerd**: welk scenario op Render geldt. Officiële docs heb ik niet gevonden. Render-staf schreef in 2021 "we set the first IP in the list to the real client IP" (dat past bij B); een gebruiker meldde in 2024 dat Render een meegestuurde header niet leegmaakt maar alleen aanvult. Bronnen: [feedback.render.com](https://feedback.render.com/features/p/send-the-correct-xforwardedfor), [community.render.com](https://community.render.com/t/accessing-client-ips-in-a-node-express-app/36282).
- **Voorstel**: eerst meten in productie, dan pas iets wijzigen; een oplossing raakt de productieconfiguratie (`config.action_dispatch.trusted_proxies`) of de sleutel van de limiet.

---

## 2. Frontend

### F1. `RecipeDetailView.vue` doet te veel – **middel**, moeite **middel** – ✅ afgerond
> Van 620 naar 146 regels. De view laadt het recept en houdt recept en porties; de delen zijn `RecipeDetailServings`, `RecipeDetailIngredients`, `RecipeDetailSteps`, `RecipeDetailVariations` (v-model:variations, event `reload`) en `RecipeDetailActions`. Eén `ConfirmDialog` per pagina, gedeeld via `src/composables/useConfirmDialog.js` (provide/inject).
- **Wat/waar**: `frontend/src/views/RecipeDetailView.vue` (620 regels) regelt laden, porties schalen, een of alle ingrediënten op de lijst, een verwijderverzoek en alle variatie-acties (toevoegen, bewerken, conflict, op lijst, verwijderen; regels 161-285). Dat zijn negen `ref`s alleen voor variaties (regels 169-178).
- **Voorstel**: een component `RecipeVariations.vue` (krijgt `recipe`, `servings` en `factor`, en emit `changed`) en een composable `useServings(recipe)` (regels 85-108). Daarmee wordt de view ongeveer de helft kleiner, en is elk deel los te testen.

### F2. Foutverwerking van formulieren staat dubbel – **middel**, moeite **klein** – ✅ afgerond
> `src/composables/useServerErrors.js` (`useServerErrors`, `errorsUnder`), gebruikt door RecipeForm en VariationForm, met een eigen spec. `numberText` staat nu in `src/utils/quantity.js`.
- **Wat/waar**: `sortedErrors` met `ROW_ERROR` en `LABELS` in `components/RecipeForm.vue:209-249` en bijna gelijk in `components/VariationForm.vue:131-168`. Ook `numberText` staat er twee keer (`RecipeForm.vue:25-27`, `VariationForm.vue:34-36`).
- **Voorstel**: composable `useServerErrors(errorsRef, { rowPattern, labels, sentKeys })` in `src/composables/`, en `numberText` naar `src/utils/quantity.js`.

### F3. Kleine dubbele hulpfuncties – **laag**, moeite **klein** – 🟡 deels (`numberText` gedeeld; `formatDate`, `useTimedMessage`, `useResource` en `attempt()` nog niet)
- `formatDate` is identiek in `views/AdminView.vue:119-127` en `views/AdminRecipeVersionsView.vue:45-53`. Kan naar `src/utils/format.js`.
- Naam normaliseren: `normalizeName` in `stores/shoppingList.js:20-22` en `normalize` in `components/TagPicker.vue:31-33`.
- Een melding die na 3 seconden verdwijnt (timer plus `onUnmounted`) staat er drie keer: `RecipeDetailView.vue:120-130`, `ShoppingListView.vue:54-69` en `StandardItemsView.vue:52-61`. Kan worden: composable `useTimedMessage()`.
- "laden / niet gevonden / fout" staat drie keer: `RecipeDetailView.vue:61-80`, `RecipeEditView.vue:30-49` en `AdminRecipeVersionsView.vue:26-43`. Kan worden: composable `useResource(fetchFn)`.
- Een `attempt()`-hulpfunctie met elk een eigen vorm: `ShoppingListView.vue:17-26` en `StandardItemsView.vue:34-48`.

### F4. Twee mechanismen voor "melding na paginawissel" – **laag**, moeite **klein**
- `notice`, `setNotice` en `takeNotice` in `stores/recipes.js:20` en `:31-39`, en daarnaast `flash`, `setFlash` en `takeFlash` in `stores/admin.js:36` en `:57-66`. Die zijn functioneel gelijk.
- **Voorstel**: één kleine store `useFlashStore` (of een van de twee hergebruiken).

### F5. API-aanroepen: deels via een store, deels direct – **laag**, geen actie nodig
- Gedeelde staat loopt via stores (`recipes`, `shoppingList`, `standardItems`, `admin`). Data die bij één pagina hoort roept de API direct aan: `RecipeDetailView.vue:7-8`, `RecipeEditView.vue:5` en `RecipeNewView.vue:5`. Dat is een verdedigbare keuze (Pinia alleen voor wat gedeeld wordt), maar staat nergens beschreven. Een regel in `frontend/README.md` maakt het voor een volgende ontwikkelaar duidelijk.
- Alle `fetch`-aanroepen lopen netjes via `src/api/client.js`. Dat is goed.

### F6. Restanten van localStorage – **laag**, moeite **klein** (jouw beslissing over het moment) – ✅ afgerond
> De import, de knoppen, de stijlregels, de bijbehorende Vitest- en e2e-tests en `normalizeName` (werd alleen door de import gebruikt) zijn weg. Er was geen apart endpoint: de import gebruikte de gewone bulk-insert, en die blijft. `localStorage` komt alleen nog voor in twee tests die controleren dat de stores er níets in zetten. De beheercode staat bewust in `sessionStorage`.
- De import van de oude lijsten: `stores/shoppingList.js:9-65` en `:183-197`, `stores/standardItems.js:6-37` en `:90-117`, de knoppen in `views/ShoppingListView.vue:52-69` en `:78-87` en `views/StandardItemsView.vue:158-170` en `:178-187`, plus de e2e-test `boodschappen: oude lijst uit deze browser importeren` (`e2e/layout.spec.js:634`).
- Van de verwijderde winkelmodus vond ik geen code meer, alleen een test die controleert dat hij weg is (`e2e/layout.spec.js:435`).
- **Voorstel**: als alle apparaten zijn geïmporteerd, de import in één stap weghalen.

### F7. Dode code in `RecipeCard.vue` – **laag**, moeite **klein**
- `recipe.image_url` (`components/RecipeCard.vue:27`): die kolom bestaat niet (`db/schema.rb:70-80`) en de API stuurt het veld niet (`app/serializers/recipe_serializer.rb:4`). De placeholder wordt dus altijd getoond.
- `tagName` (`RecipeCard.vue:12-14`) accepteert ook objecten, maar de API stuurt alleen strings (`recipe_serializer.rb:10`).
- De link is een string (`` `/recepten/${recipe.id}` ``, regel 24), terwijl overal elders een named route staat (`{ name: 'recipe', params: … }`).

### F8. Props en emits – in orde, met één kanttekening
Alle componenten gebruiken `defineProps` met types en defaults en `defineEmits` met een lijst. `VariationForm` wordt op twee manieren gebruikt: als los formulier met emits en ingebed via `defineExpose` (`VariationForm.vue:9-12` en `:129`). Daardoor roept `RecipeForm` methodes van zijn kind aan (`RecipeForm.vue:165` en `:193`). Dat werkt, maar is minder "Vue-achtig" dan `v-model`. **laag**.

### F9. Inconsistente bevestiging – **laag**, moeite **klein**
`RecipeEditView.vue:80` en `:90` gebruiken `window.confirm`, terwijl de rest van de app `ConfirmDialog` gebruikt. Navigation guards mogen een Promise teruggeven, dus `ConfirmDialog` kan hier ook.

### F10. Kleine tekstfouten in de UI – **laag**, moeite **klein**
- Na een verwijder*verzoek* zegt de app `"…" is verwijderd.` (`RecipeDetailView.vue:50` en `:279`), terwijl het recept alleen verborgen is tot de beheerder beslist.
- De bevestiging bij versie terugzetten noemt "titel, ingrediënten, stappen en tags" (`AdminRecipeVersionsView.vue:58`), maar `restore_version!` zet ook beschrijving, porties en variaties terug (`app/models/recipe.rb:103-126`).

### F11. Styling en thema – in orde
Alle kleuren, afstanden en lettergroottes zijn tokens in `src/assets/main.css:19-93`. Grep vond geen hex- of rgb-kleuren in `.vue`-bestanden. Er zijn gedeelde klassen voor knoppen, kaarten en meldingen (`main.css:205-358`). Alleen de rij-indeling voor ingrediënten (`.inputs`, `.remove`, `.general-errors`) staat vrijwel gelijk in `RecipeForm.vue` en `VariationForm.vue`. Die verdwijnt mee als F2 een gedeeld rij-component oplevert. **laag**.

---

## 3. Datamodel

| # | Bevinding | Waar | Prio | Moeite |
|---|---|---|---|---|
| D1 ✅ | Geen check constraints op `shopping_list_items` (afgerond: `db/migrate/20261015130001_add_check_constraints_to_shopping_list_items.rb`, herstelt eerst afwijkende rijen naar "naar smaak" en verwijdert niets) (eenheid bekend, hoeveelheid > 0, hoeveelheid ⇔ eenheid), terwijl `recipe_ingredients` en `variation_changes` die wel hebben | `db/schema.rb:82-92` vs `:34-36` | middel | klein |
| D2 | Ingrediëntnamen staan op twee manieren in de database: `recipe_ingredients` verwijst naar de tabel `ingredients` (FK), maar `variation_changes` (add) en `shopping_list_items` hebben een losse string `name`. `ingredients` wordt verder nergens voor gebruikt (geen endpoint) | `db/schema.rb:24-37`, `:120-128`, `:82-85` | laag | groot (alleen doen met een concreet doel, zoals autocomplete) |
| D3 | Het verwijderen van kinderen gaat op twee manieren: `recipe_variations` en `recipe_versions` met `on_delete: :cascade` in de database (`dependent: nil`), maar `steps`, `recipe_ingredients` en `recipe_tags` via `dependent: :destroy` in Rails | `db/schema.rb:149-160`, `app/models/recipe.rb:14-27` | laag | klein |
| D4 | `shopping_list_items.recipe_id` wordt opgeslagen maar nergens in de frontend gelezen (grep op `recipe_id` in `frontend/src`) | `db/schema.rb:87` | laag | klein (laten staan is ook prima) |
| D5 | Ongebruikte `ingredients` en `tags` worden nooit opgeruimd. Tags zonder recept zijn wel onzichtbaar (`tags_controller.rb:6`) | – | laag | klein |
| D6 | Indexen: alle foreign keys zijn geïndexeerd (soms via een samengestelde unieke index, zoals `steps (recipe_id, position)`), de unieke namen hebben een unieke index en `deletion_requested_at` is geïndexeerd. **Geen ontbrekende indexen gevonden** | `db/schema.rb` | – | – |
| D7 | Eenheden zijn consequent `g`, `ml` of `stuks` (`db/schema.rb:36` en `:135`, `frontend/src/utils/quantity.js:7`). Geen eetlepels of kopjes. Dat klopt met de opdracht | – | – | – |
| D8 | `recipes.description`, `created_at` en `updated_at` gaan mee in de lijst-JSON (`recipe_serializer.rb:4`), maar `RecipeCard` gebruikt ze niet | – | laag | klein |

---

## 4. Tests

**Goed gedekt**: modellen (validaties, tags, variaties, versies), alle openbare en beheer-endpoints inclusief 401, 409 en 429, de SPA-fallback (`test/integration/frontend_fallback_test.rb`), alle views, componenten en drie van de vier stores in Vitest, en de hoofdflows in Playwright (toevoegen, tags, filter, bewerken met conflict, verwijderverzoek, beheer en versies, variatie op de lijst, de lijst gedeeld tussen twee telefoons).

**Ontbreekt** (gezocht met grep, dus "niet gevonden" en niet "bewezen afwezig"):

| # | Wat ontbreekt | Prio |
|---|---|---|
| T1 ✅ | Een test van de rate limit op beheer-endpoints (nu in Rails en e2e) | hoog |
| T2 ✅ | Een pariteitstest dat `app/models/quantity.rb` en `frontend/src/utils/quantity.js` hetzelfde afronden. Ruby gebruikt `BigDecimal`, JS floats; bij randgevallen zoals x,x5 kan dat verschillen. Zie I1 | middel |
| T3 ✅ (correctie: was al gedekt; `test/controllers/api/recipes_controller_test.rb:207` controleert de tekst "heeft te veel regels", mijn grep zocht op de sleutel) | De afhandeling van `TooManyRecords` → 422 (`application_controller.rb:3-5`). Grep op `too_many_rows` en `MAX_NESTED_ROWS` in `test/` vindt niets | laag |
| T4 🟡 | Versie terugzetten met een ongeldig snapshot (nu getest) of bij een conflict (nog niet: minitest 6 heeft geen ingebouwde `stub` meer, en een echte race is lastig na te bootsen) | middel |
| T5 🟡 (`client.spec.js` bestaat nu; `stores/recipes.js` nog niet) | Geen eigen spec voor `src/api/client.js` (welke status welke `ApiError.kind` geeft) en voor `stores/recipes.js` (de "laatste load wint"-logica, regels 4-6 en 42-55) | laag |
| T6 | `App.vue`: de lijst verversen bij `visibilitychange` (regels 12-25) heeft geen unit-test | laag |
| T7 | Geen aparte Ruby-unit-test voor de module `Quantity`; die wordt alleen indirect getest via `recipe_variation_test.rb` en `recipe_variations_test.rb` | laag |

---

## 5. Inconsistenties tussen de parallel gebouwde onderdelen

| # | Onderwerp | Onderdeel A | Onderdeel B |
|---|---|---|---|
| I1 ✅ | **Op de boodschappenlijst zetten** (nu één pad via de server: `POST /api/recipes/:id/add_to_shopping_list`, `ShoppingListAddition`, `Quantity`. Daarbij bleken **beide** implementaties randgevallen fout af te ronden, 80 van 5184 combinaties: JS door float-ruis (0,35 × 3 → 1,0), Ruby doordat het eerst deelde (0,15 × 7/3 → 0,3). Allebei gerepareerd en vastgelegd in `test/fixtures/files/quantity_cases.json`) | Basisrecept: de **frontend** schaalt (`RecipeDetailView.vue:102-108`, `utils/quantity.js`), slaat optionele ingrediënten over (`:151-159`) en POST de regels naar `/api/shopping_list_items` | Variatie: de **server** schaalt (`RecipeVariation#shopping_list_items`, `recipe_variation.rb:100-112`, met `app/models/quantity.rb`) via een eigen endpoint. Twee implementaties van dezelfde rekenregel, en de herkomstlabels verschillen ("Titel" tegenover "Titel (variatie: X)") |
| I2 ✅ | Foutvorm | `{ errors: {} }` (validatie) | `{ error: "" }` in het Engels, of `{ index, errors }` (B3) |
| I3 ✅ | Not found | 5 eigen `rescue_from`'s (B4) | – |
| I4 | Normaliseren | `normalizes` (Ingredient, Tag, VariationChange) | `before_validation` (ShoppingListItem, StandardItem) (B9) |
| I5 ✅ | Tags | regels in `Recipe` | dezelfde regels in `RecipeVariation` (B6) |
| I6 | Melding na paginawissel | `recipes.notice` | `admin.flash` (F4) |
| I7 | Ingrediëntnaam | FK naar `ingredients` | losse string (D2) |
| I8 | Cascade | database (`on_delete`) | Rails (`dependent:`) (D3) |
| I9 ✅ | Database-constraints | `recipe_ingredients` en `variation_changes` hebben ze | `shopping_list_items` niet (D1) |
| I10 | Commentaar | `DeletionRequestable` zegt "later ook variaties" | variaties gebruiken het al (B14) |

---

## 6. Top 10: geprioriteerde refactorstappen

Elke stap staat op zichzelf, laat de API voor de gebruiker gelijk (tenzij vermeld) en is los te testen met `bin/rails test`, `npx vitest run` en `npm run test:e2e`.

| # | Stap | Bevindingen | Prio | Moeite | Hoe testen |
|---|---|---|---|---|---|
| 1 ✅ | **Rate limit op de beheer-endpoints** | B1, T1 | **hoog** | klein | nieuwe controllertest: de 11e foute code binnen een minuut geeft 429 |
| 2 ✅ | **Uniforme foutafhandeling** (blok 1 en 2): `rescue_from` voor NotFound, RecordInvalid en Stale in `ApplicationController` en de admin-basecontroller; alle `error`-teksten via `nl.yml`; `client.js` toont `body.error` als die er is | B3, B4, B5, T4, I2, I3 | **hoog** | middel | bestaande controllertests aanpassen op de Nederlandse tekst; nieuwe test voor terugzetten met een ongeldig snapshot; Vitest voor `client.js` |
| 3 ✅ | **Eén pad naar de boodschappenlijst**: `Recipe#shopping_list_items(servings:)` en `POST /api/recipes/:id/add_to_shopping_list`, door `RecipeVariation` hergebruikt; de frontend roept voor "Alles op lijst" dat endpoint aan. `quantity.js` blijft alleen voor de weergave | I1, T2, B11 | **hoog** | middel | modeltest dat recept en variatie dezelfde regels geven; de e2e "variatie op lijst" en "Alles op lijst" blijven groen |
| 4 🟡 | **Database-constraints op `shopping_list_items`** (✅ af) + concern `HasQuantity` voor de drie modellen (open) | D1, B8, I9 | middel | middel | migratie draaien; de bestaande modeltests van alle drie blijven groen; een test dat een onbekende eenheid ook in SQL faalt |
| 5 🟡 (tags ✅ via concern `TagNames`; `normalizes` overal nog niet) | **Tagregels op één plek** (`Tag.normalize_names` en `Tag.name_errors`) en `normalizes` overal | B6, B9, I4, I5 | middel | middel | `recipe_test`, `recipe_variation_test` en `tag_test` blijven groen; test voor `StandardItem.find_by(name: " Melk ")` |
| 6 🟡 (`useServerErrors` ✅; `useTimedMessage`, `useResource`, `utils/format.js` nog niet) | **Frontend-composables**: `useServerErrors`, `useTimedMessage`, `useResource` en `utils/format.js` | F2, F3 | middel | klein | de bestaande Vitest-specs van RecipeForm, VariationForm en de views blijven groen; nieuwe specs voor de composables |
| 7 ✅ (in vijf `RecipeDetail*`-componenten) | **`RecipeDetailView` opsplitsen** in `RecipeVariations.vue` + `useServings` | F1 | middel | middel | `RecipeDetailView.spec.js` en `RecipeDetailVariations.spec.js` blijven groen, en e2e `variations.spec.js` ook |
| 8 | **Kleine opschoonronde**: `RecipeCard` (image_url, tagName, named route), het commentaar in `DeletionRequestable`, de UI-teksten "is verwijderd" en "terugzetten", `window.confirm` → `ConfirmDialog`, één flash-store | F4, F7, F9, F10, B14 (alleen code) | laag | klein | Vitest en e2e; de screenshots bekijken |
| 9 ✅ | **Legacy localStorage-import verwijderen** (alleen als jij zegt dat alle apparaten zijn overgezet) | F6 | laag | klein | de e2e-importtest gaat mee weg; de rest blijft groen |
| 10 ⛔ | **Productie- en gem-opruiming** (vervallen) (alleen met jouw toestemming): `solid_cache` voor de rate limit, `rails/all` vervangen door alleen de gebruikte frameworks, Kamal en `image_processing` weg | B2, B14 | laag/middel | middel | alle CI-commando's; een deploy op Render controleren |

Volgorde: 1 → 2 → 3 lossen de belangrijkste risico's en inconsistenties op. 4 en 5 maken de backend consistent, 6 en 7 de frontend. 8 tot en met 10 zijn opruimwerk.
