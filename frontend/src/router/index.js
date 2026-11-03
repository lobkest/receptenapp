import { createRouter, createWebHistory } from 'vue-router'
import RecipeListView from '@/views/RecipeListView.vue'
import RecipeNewView from '@/views/RecipeNewView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'
import ShoppingListView from '@/views/ShoppingListView.vue'
import StandardItemsView from '@/views/StandardItemsView.vue'
import RecipeEditView from '@/views/RecipeEditView.vue'
import AdminView from '@/views/AdminView.vue'
import IngredientsView from '@/views/IngredientsView.vue'
import IngredientEditView from '@/views/IngredientEditView.vue'
import PantryView from '@/views/PantryView.vue'
import AdminRecipeVersionsView from '@/views/AdminRecipeVersionsView.vue'
import { useAdminStore } from '@/stores/admin'

// meta.needsServer: zolang de server niet online is, toont App.vue een laadmelding in plaats
// van de pagina (geen oude data). Zodra hij online is, opent de pagina en haalt hij vers op.
// meta.keepMounted: de pagina blijft dan wel bestaan (alleen verborgen), zodat een half
// ingevuld formulier niet verdwijnt als de server even slaapt.
// meta.offline: de pagina kan uit de offline snapshot (stores/snapshot.js); is die er,
// dan wacht hij niet op de server maar toont hij meteen de kopie.
// meta.onlineOnly: zonder verbinding (serverStatus.offline) toont App.vue alleen de
// offline-melding met "… is offline niet beschikbaar", ook als er een snapshot is.
// meta.offlineName: de paginanaam in die regel ("In huis is offline niet beschikbaar").
export const routes = [
  {
    path: '/',
    name: 'recipes',
    component: RecipeListView,
    meta: { needsServer: true, offline: true, offlineName: 'Recepten' },
  },
  {
    path: '/recepten/nieuw',
    name: 'recipe-new',
    component: RecipeNewView,
    meta: { needsServer: true, keepMounted: true, offlineName: 'Recept toevoegen' },
  },
  // props: true geeft :id als prop door aan het component, in plaats van via useRoute().
  { path: '/recepten/:id', name: 'recipe', component: RecipeDetailView, props: true },
  // Iedereen mag bewerken.
  { path: '/recepten/:id/bewerken', name: 'recipe-edit', component: RecipeEditView, props: true },
  { path: '/boodschappen', name: 'shopping-list', component: ShoppingListView },
  {
    path: '/standaard',
    name: 'standard-items',
    component: StandardItemsView,
    meta: { needsServer: true, offline: true, offlineName: 'Standaardboodschappen' },
  },
  // Wat je in huis hebt, en welke recepten je daarmee kunt maken.
  {
    path: '/in-huis',
    name: 'pantry',
    component: PantryView,
    // offline: tijdens het opstarten van de server de kopie; zonder verbinding niets.
    meta: { needsServer: true, offline: true, onlineOnly: true, offlineName: 'In huis' },
  },
  // Koppelen aan NEVO voor de voedingswaarde; iedereen mag dit, zoals recepten bewerken.
  {
    path: '/ingredienten',
    name: 'ingredients',
    component: IngredientsView,
    meta: { needsServer: true, offlineName: 'Ingrediënten' },
  },
  { path: '/ingredienten/:id', name: 'ingredient', component: IngredientEditView, props: true },
  // /beheer toont zelf het inlogscherm als je niet ingelogd bent, dus geen guard nodig.
  {
    path: '/beheer',
    name: 'admin',
    component: AdminView,
    meta: { onlineOnly: true, offlineName: 'Beheer' },
  },
  {
    path: '/beheer/recepten/:id/versies',
    name: 'admin-recipe-versions',
    component: AdminRecipeVersionsView,
    props: true,
    meta: { requiresAdmin: true },
  },
  // Oude links naar de beheer-bewerkpagina: bewerken is nu voor iedereen.
  { path: '/beheer/recepten/:id/bewerken', redirect: (to) => `/recepten/${to.params.id}/bewerken` },
]

// Navigation guard: draait vóór elke routewissel. Zonder code stuurt hij je
// naar het inlogscherm. Dit is alleen gebruiksgemak; de API weigert zelf elke
// request zonder geldige code.
export function requireAdmin(to) {
  if (to.meta.requiresAdmin && !useAdminStore().isLoggedIn) {
    return { name: 'admin' }
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(requireAdmin)

export default router
