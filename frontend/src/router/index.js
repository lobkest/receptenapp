import { createRouter, createWebHistory } from 'vue-router'
import RecipeListView from '@/views/RecipeListView.vue'
import RecipeNewView from '@/views/RecipeNewView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'
import ShoppingListView from '@/views/ShoppingListView.vue'
import StandardItemsView from '@/views/StandardItemsView.vue'
import AdminView from '@/views/AdminView.vue'
import AdminRecipeEditView from '@/views/AdminRecipeEditView.vue'
import { useAdminStore } from '@/stores/admin'

export const routes = [
  { path: '/', name: 'recipes', component: RecipeListView },
  { path: '/recepten/nieuw', name: 'recipe-new', component: RecipeNewView },
  // props: true geeft :id als prop door aan het component, in plaats van via useRoute().
  { path: '/recepten/:id', name: 'recipe', component: RecipeDetailView, props: true },
  { path: '/boodschappen', name: 'shopping-list', component: ShoppingListView },
  { path: '/standaard', name: 'standard-items', component: StandardItemsView },
  // /beheer toont zelf het inlogscherm als je niet ingelogd bent, dus geen guard nodig.
  { path: '/beheer', name: 'admin', component: AdminView },
  {
    path: '/beheer/recepten/:id/bewerken',
    name: 'admin-recipe-edit',
    component: AdminRecipeEditView,
    props: true,
    meta: { requiresAdmin: true },
  },
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
