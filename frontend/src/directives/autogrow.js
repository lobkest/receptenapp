// v-autogrow: een textarea groeit mee met de tekst. CSS doet dat met field-sizing:
// content; browsers die dat (nog) niet kennen, krijgen de hoogte hier: eerst 'auto' zodat
// hij ook kan krimpen, dan de hoogte van de inhoud plus de rand. Vue roept de directive
// aan als de textarea op het scherm komt en na elke wijziging, ook van v-model.
//
//   import { vAutogrow } from '@/directives/autogrow'
//   <textarea v-model="text" v-autogrow rows="2"></textarea>
//
// Gebruikt door RecipeForm (beschrijving) en RecipeFormStepRow (stappen).
const fieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

function grow(textarea) {
  textarea.style.height = 'auto'
  const border = textarea.offsetHeight - textarea.clientHeight
  if (textarea.scrollHeight) textarea.style.height = `${textarea.scrollHeight + border}px`
}

export const vAutogrow = fieldSizing ? {} : { mounted: grow, updated: grow }
