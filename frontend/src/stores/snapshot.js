import { defineStore } from 'pinia'
import { fetchOfflineSnapshot } from '@/api/offline'
import { isOffline, loadSnapshot, saveSnapshot } from '@/offline'
import { useOfflineStore } from '@/stores/offline'
import { useServerStatusStore } from '@/stores/serverStatus'

// De offline snapshot (GET /api/offline_snapshot): alle recepten volledig, de tags en
// categorieën, de ingrediëntnamen, de standaardlijst en de voorraad, bewaard in IndexedDB.
// De recepten-, standaard- en In-huis-pagina's tonen hem meteen bij openen en verversen
// daarna (stale-while-revalidate); zonder verbinding is het alles wat er is.
//
// Bij elke load() sturen we de ETag van de vorige keer mee (If-None-Match). Niets veranderd:
// de server zegt 304 en we houden de kopie (alleen het tijdstip wordt nu). Zo kost een
// verversing bijna niets. De boodschappenlijst zit er niet in; die heeft zijn eigen kopie
// (stores/shoppingList.js), want die verandert bij elke tik in de winkel.

const KEY = 'app'

// Een lopende load(), zodat App en een pagina die tegelijk aanroepen maar één request doen.
let pendingLoad = null

export const useSnapshotStore = defineStore('snapshot', {
  state: () => ({
    // { recipes, tags, categories, ingredients, standard_items, pantry }, of null.
    data: null,
    etag: null,
    // Wanneer de server de kopie voor het laatst gaf of bevestigde (ms), of null.
    savedAt: null,
    restored: false,
  }),

  getters: {
    available: (state) => state.data != null,
    recipes: (state) => state.data?.recipes ?? [],
    recipe: (state) => (id) =>
      state.data?.recipes.find((recipe) => recipe.id === Number(id)) ?? null,
    ingredients: (state) => state.data?.ingredients ?? [],
  },

  actions: {
    // De opgeslagen kopie, één keer per bezoek (synchroon: de opslag staat al in het
    // geheugen, zie src/offline/storage.js). Pagina's roepen dit aan vóór ze iets tonen.
    restore() {
      if (this.restored) return
      this.restored = true
      const snapshot = loadSnapshot(KEY)
      if (!snapshot?.data || !Array.isArray(snapshot.data.recipes)) return
      this.data = snapshot.data
      this.etag = snapshot.etag ?? null
      this.savedAt = snapshot.savedAt
    },

    // Eerst de outbox versturen (anders is de snapshot meteen weer oud), dan ophalen met
    // de ETag. Zonder verbinding blijft de kopie staan, en ook zolang de server niet online
    // is (App.vue ververst bij de overgang naar online). Gooit nooit: een pagina zonder
    // snapshot haalt zelf op en toont zelf de fout.
    load() {
      this.restore()
      if (pendingLoad) return pendingLoad
      if (isOffline() || (this.data && !useServerStatusStore().online)) return Promise.resolve()
      pendingLoad = useOfflineStore()
        .sync()
        .then(() => fetchOfflineSnapshot(this.data ? this.etag : null))
        .then((result) => {
          if (result.notModified) {
            this.savedAt = Date.now()
          } else {
            this.data = result.data
            this.etag = result.etag
            this.savedAt = Date.now()
          }
          this.persist()
        })
        // Geen verbinding of de server stuk: de oude kopie blijft staan.
        .catch(() => {})
        .finally(() => (pendingLoad = null))
      return pendingLoad
    },

    persist() {
      saveSnapshot(KEY, this.data, this.savedAt, { etag: this.etag })
    },

    // Een pagina haalde vers op (de standaardlijst, de voorraad): zet dat deel ook in de
    // kopie, zodat hij klopt als de verbinding straks wegvalt. De ETag blijft die van de
    // hele snapshot: is er intussen meer veranderd, dan geeft de volgende load() 200.
    patch(key, value) {
      this.restore()
      if (!this.data) return
      this.data = { ...this.data, [key]: value }
      this.persist()
    },
  },
})
