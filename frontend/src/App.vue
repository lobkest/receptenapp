<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header>
    <nav>
      <RouterLink to="/">Recepten</RouterLink>
      <RouterLink to="/recepten/nieuw">Recept insturen</RouterLink>
    </nav>
  </header>
  <main>
    <RouterView />
  </main>
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
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
}

nav {
  display: flex;
  gap: 1rem;
}

/* RouterLink zet deze class op de link van de huidige pagina. */
nav a.router-link-exact-active {
  font-weight: bold;
}
</style>
