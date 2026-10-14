# A tag that a RecipeVariation adds ("+ vis") or takes off ("− vega"). Adding only makes
# sense for a tag the base recipe does not have, taking off only for one it has.
# Recipe#link_tags removes the changes that no longer fit when the recipe's tags change.
class VariationTagChange < ApplicationRecord
  belongs_to :recipe_variation
  belongs_to :tag

  enum :kind, { add: "add", remove: "remove" }, prefix: true, validate: true

  validates :tag_id, uniqueness: { scope: :recipe_variation_id }
  validate :fits_the_base_recipe

  private
    def fits_the_base_recipe
      return if tag.nil? || recipe_variation&.recipe.nil?

      on_recipe = recipe_variation.recipe.tag_names.include?(tag.name)
      errors.add(:tag, :on_recipe) if kind_add? && on_recipe
      errors.add(:tag, :not_on_recipe) if kind_remove? && !on_recipe
    end
end
