import { defineStore } from 'pinia'
import * as shoppingApi from '@/api/shoppingList'
import { addRecipeToShoppingList } from '@/api/recipes'
import {
  addStandardNamesToShoppingList,
  createStandardItem,
  removeStandardNamesFromShoppingList,
  deleteStandardItem,
  updateStandardItem,
} from '@/api/standardItems'
import { addVariationToShoppingList } from '@/api/variations'
import { createOutbox, isNetworkError, OUTBOX_KEY } from '@/offline'

// De outbox van de hele app (src/offline/outbox.js): wat je offline op de boodschappenlijst
// en de standaardlijst doet, op volgorde, tot het naar de server kan. De stores van die
// lijsten zetten er acties in (enqueue) en tonen ze alvast; sync() verstuurt ze. Elke
// load() van een lijst (en van de snapshot) roept eerst sync() aan; App.vue doet dat bij
// openen, bij terugkeren naar de app en als de verbinding terugkomt.
const outbox = createOutbox(OUTBOX_KEY)

// Per type het request. id: de server-id van het target (outbox.resolve). Geeft { id }
// terug als er iets nieuws is gemaakt, zodat acties erna weten welk id het werd.
const SENDERS = {
  'shopping.check': ({ payload }, { id }) =>
    shoppingApi.updateShoppingListItem(id, { checked: payload.checked }),
  'shopping.count': ({ payload }, { id }) =>
    shoppingApi.updateShoppingListItem(id, { count: payload.count }),
  'shopping.delete': (_action, { id }) => shoppingApi.deleteShoppingListItem(id),
  'shopping.addLoose': async ({ id: clientActionId, payload }) => {
    const lines = await shoppingApi.addLooseItem({
      name: payload.name,
      count: payload.count,
      ingredient_id: payload.ingredient_id ?? null,
      checked: payload.checked ?? false,
      client_action_id: clientActionId,
    })
    return { id: lines[0]?.id ?? null }
  },
  'shopping.addRecipe': ({ id: clientActionId, payload }) =>
    addRecipeToShoppingList(
      payload.recipe_id,
      payload.servings,
      payload.ingredient_ids,
      payload.alternative_ids,
      [],
      { clientActionId, skipInHouse: payload.skip_in_house },
    ),
  'shopping.addVariation': ({ id: clientActionId, payload }) =>
    addVariationToShoppingList(
      payload.recipe_id,
      payload.variation_id,
      payload.servings,
      payload.alternative_ids,
      {},
      { clientActionId, skipInHouse: true },
    ),
  'shopping.addStandard': ({ id: clientActionId, payload }) =>
    addStandardNamesToShoppingList(payload.names, clientActionId),
  // Twee keer versturen is geen probleem: de tweede keer is er geen standaarddeel meer.
  'shopping.removeStandard': ({ payload }) => removeStandardNamesFromShoppingList(payload.names),
  'standard.create': ({ id: clientId, payload }) =>
    createStandardItem({ name: payload.name, category: payload.category, client_id: clientId }),
  'standard.update': ({ payload }, { id }) =>
    updateStandardItem(id, {
      name: payload.name,
      category: payload.category,
      ...(payload.temporary === false && { temporary: false }),
    }),
  'standard.delete': (_action, { id }) => deleteStandardItem(id),
}

function send(action, context) {
  const sender = SENDERS[action.type]
  // Een onbekend type (een oudere of nieuwere app): niet te versturen, dus overslaan.
  if (!sender) return Promise.resolve(null)
  return sender(action, context)
}

// Eén melding voor alles wat de server weigerde.
export function droppedMessage(dropped) {
  if (dropped.length === 1) {
    return `Een wijziging van toen je offline was, is niet opgeslagen: ${dropped[0].error.message}`
  }
  return `${dropped.length} wijzigingen van toen je offline was, zijn niet opgeslagen.`
}

export const useOfflineStore = defineStore('offline', {
  state: () => ({
    // Hoeveel acties nog in de outbox staan (een kopie van outbox.size, die zelf niet
    // reactief is): "3 wijzigingen wachten op verbinding".
    pending: outbox.size,
    // De melding als de server iets van de outbox weigerde (422), of null.
    notice: null,
    // Telt elke verandering van de outbox (ook samenvoegen, waarbij pending gelijk blijft).
    revision: 0,
  }),

  getters: {
    // Alle acties, voor de stores die ze over de stand van de server heen leggen.
    // Via revision: zo rekent een getter die dit gebruikt opnieuw als de outbox verandert.
    queued: (state) => (state.revision >= 0 ? outbox.all() : []),
  },

  actions: {
    // Zie outbox.enqueue: geeft 'added', 'merged' of 'cancelled' terug.
    enqueue(action) {
      const result = outbox.enqueue(action)
      this.pending = outbox.size
      this.revision++
      return result
    },

    // Haalt de 'set'-acties van dit type voor target weg: online is net een nieuwere waarde
    // verstuurd, die mag later niet door een oudere overschreven worden.
    discardSets(target, type) {
      outbox.discard((a) => a.kind === 'set' && a.target === target && a.type === type)
      this.pending = outbox.size
      this.revision++
    },

    // De server-id voor een target, of null als dat nog niet bekend is.
    resolve(target) {
      return outbox.resolve(target)
    },

    has(prefix) {
      return outbox.all().some((action) => action.type.startsWith(prefix))
    },

    // Verstuurt de outbox. Zonder verbinding gooit hij de fout door (de rest blijft staan);
    // lukt het om een andere reden niet (server stuk, te veel verzoeken), dan blijft de
    // rest ook staan en proberen we het bij de volgende keer opnieuw. Geeft { sent,
    // skipped, dropped } terug, of null als er niets te doen was of het niet lukte.
    async sync() {
      if (outbox.size === 0) return null
      try {
        const result = await outbox.flush(send)
        if (result.dropped.length) this.notice = droppedMessage(result.dropped)
        return result
      } catch (e) {
        if (isNetworkError(e)) throw e
        return null
      } finally {
        this.pending = outbox.size
        this.revision++
      }
    },

    dismissNotice() {
      this.notice = null
    },
  },
})
