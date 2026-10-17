# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
#
# Example:
#
#   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
#     MovieGenre.find_or_create_by!(name: genre_name)
#   end

# The start categories, the same as migration AddStartCategories. A new database made
# from db/schema.rb (db:prepare, db:setup) skips the migrations and gets them here.
# An existing name (in any case) is left alone.
[ "Ontbijt", "Lunch", "Diner", "Snacks" ].each.with_index(1) do |name, position|
  Category.find_named(name) || Category.create!(name: name, position: position)
end

# The traits and the automatic tags, the same as migration AddAutomaticTags. An existing
# tag with the same name is reused.
%w[ vlees vis dierlijk gluten lactose ].each { |name| Trait.find_or_create_by!(name: name) }
{
  "vegetarisch" => %w[ vlees vis ],
  "veganistisch" => %w[ dierlijk ],
  "glutenvrij" => %w[ gluten ],
  "lactosevrij" => %w[ lactose ]
}.each do |tag_name, trait_names|
  tag = Tag.named(tag_name)
  Trait.where(name: trait_names).find_each { |trait| TagExclusion.find_or_create_by!(tag: tag, trait: trait) }
end

# The basisvoorraad, the same list as migration MarkStapleIngredients. Only ingredients
# that exist; a name that does not is skipped.
Ingredient.where(name: [ "zout", "peper", "olijfolie", "suiker", "bloem", "balsamicoazijn", "paprikapoeder",
  "italiaanse kruiden", "water" ]).where(staple: false).update_all(staple: true, updated_at: Time.current)
