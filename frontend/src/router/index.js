import { createRouter, createWebHistory } from 'vue-router'
import RecipeListView from '@/views/RecipeListView.vue'
import RecipeNewView from '@/views/RecipeNewView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'
import ShoppingListView from '@/views/ShoppingListView.vue'
import StandardItemsView from '@/views/StandardItemsView.vue'
import RecipeEditView from '@/views/RecipeEditView.vue'
import AdminView from '@/views/AdminView.vue'
import AdminRecipeVersionsView from '@/views/AdminRecipeVersionsView.vue'
import { useAdminStore } from '@/stores/admin'

export const routes = [
  { path: '/', name: 'recipes', component: RecipeListView },
  { path: '/recepten/nieuw', name: 'recipe-new', component: RecipeNewView },
  // props: true geeft :id als prop door aan het component, in plaats van via useRoute().
  { path: '/recepten/:id', name: 'recipe', component: RecipeDetailView, props: true },
  // Iedereen mag bewerken.
  { path: '/recepten/:id/bewerken', name: 'recipe-edit', component: RecipeEditView, props: true },
  { path: '/boodschappen', name: 'shopping-list', component: ShoppingListView },
  { path: '/standaard', name: 'standard-items', component: StandardItemsView },
  // /beheer toont zelf het inlogscherm als je niet ingelogd bent, dus geen guard nodig.
  { path: '/beheer', name: 'admin', component: AdminView },
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
