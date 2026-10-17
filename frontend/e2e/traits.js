import { expect } from '@playwright/test'
import { ADMIN_TOKEN } from './env.js'

// Kenmerken (vlees, vis, dierlijk, gluten, lactose) geven aan een testingrediënt, zodat de
// automatische tags (vegetarisch, ...) iets zinnigs laten zien. Een nieuw ingrediënt
// heeft geen kenmerken en telt dan overal als "past".
//
// Ingrediënten ontstaan alleen via een recept. Bestaat het nog niet, dan maakt dit een
// hulprecept, vraagt verwijderen aan en laat de beheerder het definitief verwijderen;
// het ingrediënt blijft bestaan. Zo staat er geen hulprecept in lijsten of in het beheer.
// Eigen adres voor de rate limit van beheer (zie useOwnIp in env.js).
export async function giveTraits(api, name, traitNames) {
  let ingredient = await findIngredient(api, name)
  if (!ingredient) {
    const created = await api.post('/api/recipes', {
      data: {
        recipe: {
          title: `Hulprecept ${name}`,
          servings: 1,
          steps_attributes: [{ body: 'Alleen om het ingrediënt te maken.' }],
          recipe_ingredients_attributes: [{ ingredient_name: name }],
        },
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()
    expect((await api.post(`/api/recipes/${id}/request_deletion`, { data: {} })).status()).toBe(204)
    const deleted = await api.delete(`/api/admin/recipes/${id}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'CF-Connecting-IP': '203.0.113.200' },
    })
    expect(deleted.status(), await deleted.text()).toBe(204)
    ingredient = await findIngredient(api, name)
  }

  const response = await api.patch(`/api/ingredients/${ingredient.id}/traits`, {
    data: { ingredient: { trait_names: traitNames } },
  })
  expect(response.status(), await response.text()).toBe(200)
  return ingredient.id
}

async function findIngredient(api, name) {
  const ingredients = await (await api.get('/api/ingredients')).json()
  return ingredients.find((ingredient) => ingredient.name === name)
}
