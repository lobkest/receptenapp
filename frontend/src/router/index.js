import { createRouter, createWebHistory } from 'vue-router'
import RecipeListView from '@/views/RecipeListView.vue'
import RecipeNewView from '@/views/RecipeNewView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'recipes', component: RecipeListView },
    { path: '/recepten/nieuw', name: 'recipe-new', component: RecipeNewView },
    // props: true geeft :id als prop door aan het component, in plaats van via useRoute().
    { path: '/recepten/:id', name: 'recipe', component: RecipeDetailView, props: true },
  ],
})

export default router
