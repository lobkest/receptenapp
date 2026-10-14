<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useWakeLock } from '@/composables/useWakeLock'
import { useShoppingListStore } from '@/stores/shoppingList'
import { useStandardItemsStore } from '@/stores/standardItems'
import { byName, groupByCategory } from '@/utils/grouping'
import { formatQuantity } from '@/utils/quantity'

// Winkelmodus: dezelfde boodschappenlijst, maar ingericht om in de winkel met
// één duim te gebruiken. Afvinken is gewoon list.toggle, dus /boodschappen en
// localStorage lopen altijd gelijk.
const list = useShoppingListStore()
const standard = useStandardItemsStore()
const router = useRouter()
const { status: wakeStatus } = useWakeLock()

const WAKE_MESSAGES = {
  active: 'Je scherm blijft aan zolang deze pagina open is.',
  unsupported: 'Je scherm kan uitgaan: deze browser kan het niet aan houden.',
  error: 'Je scherm kan uitgaan: de browser staat het nu niet toe (bijv. door batterijbesparing).',
}

// Nog te halen, per categorie uit de standaardboodschappen; onbekend = "overig".
const openGroups = computed(() =>
  groupByCategory(list.items.filter((item) => !item.checked).toSorted(byName), (item) =>
    standard.categoryFor(item.name),
  ),
)

const basket = computed(() => list.items.filter((item) => item.checked).toSorted(byName))

function amount(item) {
  return item.quantity == null ? '' : `${formatQuantity(item.quantity)} ${item.unit}`
}

function label(item, action) {
  return [item.name, amount(item)].filter(Boolean).join(', ') + `: ${action}`
}

// De laatst gepakte regel, om per ongeluk tikken ongedaan te maken.
const lastPicked = ref(null)
let undoTimer = null

onUnmounted(() => clearTimeout(undoTimer))

function pick(item) {
  list.toggle(item.key)
  lastPicked.value = { key: item.key, name: item.name }
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (lastPicked.value = null), 5000)
}

// Terug op de lijst: vanuit de melding of vanuit het mandje.
function putBack(key) {
  const item = list.items.find((i) => i.key === key)
  if (item?.checked) list.toggle(key)
  if (lastPicked.value?.key === key) {
    lastPicked.value = null
    clearTimeout(undoTimer)
  }
}

function finish() {
  if (!window.confirm('Klaar met winkelen? Alles in je mandje gaat van de lijst af.')) return
  list.clearChecked()
  router.push({ name: 'shopping-list' })
}
</script>

<template>
  <h1>Winkelen</h1>
  <p class="wake-status muted" :data-status="wakeStatus">{{ WAKE_MESSAGES[wakeStatus] }}</p>

  <div v-if="list.items.length === 0" class="empty card">
    <p>Je boodschappenlijst is leeg.</p>
    <RouterLink to="/boodschappen" class="btn">Naar boodschappen</RouterLink>
  </div>

  <template v-else>
    <p v-if="list.openCount" class="progress">
      Nog <strong>{{ list.openCount }}</strong> te halen
    </p>
    <p v-else class="all-done card">Alles in je mandje!</p>

    <section v-for="group in openGroups" :key="group.category ?? ''" class="group">
      <h2>{{ group.category ?? 'overig' }}</h2>
      <!-- TransitionGroup speelt de CSS-klassen pick-leave-* af als een item van
           de lijst verdwijnt, en pick-move voor de items die eronder opschuiven. -->
      <TransitionGroup tag="ul" name="pick" class="items">
        <li v-for="item in group.items" :key="item.key">
          <button
            type="button"
            class="pick"
            :aria-label="label(item, 'in mandje')"
            @click="pick(item)"
          >
            <span class="tick" aria-hidden="true"></span>
            <span class="name">{{ item.name }}</span>
            <span v-if="amount(item)" class="amount">{{ amount(item) }}</span>
          </button>
        </li>
      </TransitionGroup>
    </section>

    <details v-if="basket.length" class="basket card">
      <summary>In mandje ({{ basket.length }})</summary>
      <ul class="basket-items">
        <li v-for="item in basket" :key="item.key">
          <button
            type="button"
            class="put-back"
            :aria-label="label(item, 'terug op de lijst')"
            @click="putBack(item.key)"
          >
            <span class="name">{{ item.name }}</span>
            <span v-if="amount(item)" class="amount">{{ amount(item) }}</span>
            <span class="undo-hint" aria-hidden="true">terugzetten</span>
          </button>
        </li>
      </ul>
    </details>

    <div class="finish">
      <button v-if="list.hasChecked" type="button" class="btn-primary btn-block" @click="finish">
        Klaar: afgevinkte wissen
      </button>
      <RouterLink to="/boodschappen" class="back-link">← Terug naar de lijst</RouterLink>
    </div>
  </template>

  <!-- Blijft onderaan in beeld, boven de menubalk. -->
  <div class="undo-bar" role="status">
    <template v-if="lastPicked">
      <span>{{ lastPicked.name }} in mandje</span>
      <button type="button" class="undo" @click="putBack(lastPicked.key)">Ongedaan maken</button>
    </template>
  </div>
</template>

<style scoped>
h1 {
  margin-bottom: var(--space-1);
}

.wake-status {
  font-size: var(--text-sm);
}

.progress {
  font-size: var(--text-lg);
}

.all-done {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  text-align: center;
  color: var(--color-accent-text);
}

.empty {
  text-align: center;
}

.group {
  margin-bottom: var(--space-5);
}

/* Zelfde kleine kopjes als bij de standaardboodschappen: een afdeling in de winkel. */
.group h2 {
  margin-bottom: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

/* position: relative, zodat een vertrekkend item (absolute, zie onder) binnen de lijst blijft. */
.items {
  position: relative;
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.items li {
  width: 100%;
}

/* Elk item is één groot aanraakvak over de hele breedte. */
.pick {
  justify-content: flex-start;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-xl);
  font-weight: 600;
  text-align: left;
  border-color: var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

/* Leeg rondje dat bij het afvinken vol groen wordt met een vinkje. */
.tick {
  position: relative;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.tick::after {
  content: '';
  position: absolute;
  left: 0.5rem;
  top: 0.2rem;
  width: 0.45rem;
  height: 0.85rem;
  border: solid var(--color-on-brand);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
  opacity: 0;
}

.name {
  flex: 1;
  overflow-wrap: anywhere;
}

.amount {
  flex-shrink: 0;
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--color-text-muted);
}

/* De animatie: vinkje vol, dan naar rechts uitfaden; de rest schuift op. */
.pick-leave-active {
  position: absolute;
  transition:
    opacity 220ms ease 80ms,
    transform 220ms ease 80ms;
}

.pick-leave-active .tick {
  background: var(--color-brand);
  border-color: var(--color-brand);
}

.pick-leave-active .tick::after {
  opacity: 1;
}

.pick-leave-to {
  opacity: 0;
  transform: translateX(2rem);
}

.pick-move {
  transition: transform 220ms ease 80ms;
}

/* Minder beweging: geen transitie, dus Vue haalt het item meteen weg. */
@media (prefers-reduced-motion: reduce) {
  .pick-leave-active,
  .pick-move {
    transition: none;
  }
}

.basket {
  margin-top: var(--space-5);
  padding: 0;
}

.basket summary {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  padding: var(--space-2) var(--space-4);
  font-weight: 600;
  cursor: pointer;
}

.basket-items {
  margin: 0;
  padding: 0 var(--space-4) var(--space-2);
  list-style: none;
}

.basket-items li + li {
  border-top: 1px solid var(--color-border);
}

.put-back {
  justify-content: flex-start;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) 0;
  font-weight: 400;
  text-align: left;
  background: transparent;
  border: 0;
}

.put-back .name {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.undo-hint {
  font-size: var(--text-sm);
  color: var(--color-accent-text);
}

.finish {
  margin-top: var(--space-5);
}

/* Sticky boven de menubalk; leeg (zonder melding) neemt hij geen ruimte in. */
.undo-bar {
  position: sticky;
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-2));
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  color: var(--color-bg);
  background: var(--color-text);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.undo-bar:empty {
  padding: 0;
  box-shadow: none;
}

@media (min-width: 40rem) {
  .undo-bar {
    bottom: var(--space-3);
  }
}

.undo {
  flex-shrink: 0;
  color: var(--color-bg);
  background: transparent;
  border-color: var(--color-bg);
}

.undo:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-bg);
}
</style>
