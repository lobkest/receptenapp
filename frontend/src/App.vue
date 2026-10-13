<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useShoppingListStore } from '@/stores/shoppingList'

const shoppingList = useShoppingListStore()
</script>

<template>
  <header>
    <nav>
      <RouterLink to="/" class="brand">
        <img src="/icon-192.png" alt="Recepten-logo" width="24" height="24" />
        Recepten
      </RouterLink>
      <RouterLink to="/recepten/nieuw">Recept insturen</RouterLink>
      <RouterLink to="/boodschappen" class="shopping-link">
        Boodschappen<span v-if="shoppingList.openCount"> ({{ shoppingList.openCount }})</span>
      </RouterLink>
    </nav>
  </header>
  <main>
    <RouterView />
  </main>
  <!-- Beheer bewust niet in het hoofdmenu: bezoekers hebben er niets te zoeken. -->
  <footer>
    <RouterLink to="/beheer">Beheer</RouterLink>
  </footer>
</template>

<!-- Niet scoped: basisstijl voor de hele pagina. -->
<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: #222;
}
</style>

<style scoped>
header {
  border-bottom: 1px solid #ddd;
}

nav,
main,
footer {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
}

nav {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

footer {
  margin-top: 2rem;
  border-top: 1px solid #eee;
  font-size: 0.85rem;
}

footer a {
  color: #888;
}

/* RouterLink zet deze class op de link van de huidige pagina. */
nav a.router-link-exact-active {
  font-weight: bold;
}
</style>
