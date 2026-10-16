# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_16_150001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "categories", force: :cascade do |t|
    t.string "name", null: false
    t.integer "position", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((name)::text)", name: "index_categories_on_lower_name", unique: true
  end

  create_table "ingredients", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_ingredients_on_name", unique: true
  end

  create_table "recipe_ingredients", force: :cascade do |t|
    t.bigint "recipe_id", null: false
    t.bigint "ingredient_id", null: false
    t.decimal "quantity", precision: 10, scale: 2
    t.string "unit"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "optional", default: false, null: false
    t.index ["ingredient_id"], name: "index_recipe_ingredients_on_ingredient_id"
    t.index ["recipe_id", "ingredient_id"], name: "index_recipe_ingredients_on_recipe_id_and_ingredient_id", unique: true
    t.check_constraint "(quantity IS NULL) = (unit IS NULL)", name: "recipe_ingredients_quantity_has_unit"
    t.check_constraint "quantity > 0::numeric", name: "recipe_ingredients_quantity_positive"
    t.check_constraint "unit::text = ANY (ARRAY['g'::character varying, 'ml'::character varying, 'stuks'::character varying, 'tl'::character varying, 'el'::character varying]::text[])", name: "recipe_ingredients_unit_known"
  end

  create_table "recipe_tags", force: :cascade do |t|
    t.bigint "recipe_id", null: false
    t.bigint "tag_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recipe_id", "tag_id"], name: "index_recipe_tags_on_recipe_id_and_tag_id", unique: true
    t.index ["tag_id"], name: "index_recipe_tags_on_tag_id"
  end

  create_table "recipe_variations", force: :cascade do |t|
    t.bigint "recipe_id", null: false
    t.string "name", null: false
    t.text "notes"
    t.integer "position", null: false
    t.integer "lock_version", default: 0, null: false
    t.datetime "deletion_requested_at"
    t.string "deletion_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["deletion_requested_at"], name: "index_recipe_variations_on_deletion_requested_at"
    t.index ["recipe_id"], name: "index_recipe_variations_on_recipe_id"
  end

  create_table "recipe_versions", force: :cascade do |t|
    t.bigint "recipe_id", null: false
    t.jsonb "snapshot", null: false
    t.string "summary", null: false
    t.datetime "created_at", null: false
    t.index ["recipe_id"], name: "index_recipe_versions_on_recipe_id"
  end

  create_table "recipes", force: :cascade do |t|
    t.string "title", null: false
    t.text "description"
    t.integer "servings", default: 4, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "lock_version", default: 0, null: false
    t.datetime "deletion_requested_at"
    t.string "deletion_reason"
    t.bigint "category_id"
    t.index ["category_id"], name: "index_recipes_on_category_id"
    t.index ["deletion_requested_at"], name: "index_recipes_on_deletion_requested_at"
  end

  create_table "shopping_list_items", force: :cascade do |t|
    t.string "name", null: false
    t.decimal "quantity", precision: 10, scale: 2
    t.string "unit"
    t.string "source_label"
    t.bigint "recipe_id"
    t.boolean "checked", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recipe_id"], name: "index_shopping_list_items_on_recipe_id"
    t.check_constraint "(quantity IS NULL) = (unit IS NULL)", name: "shopping_list_items_quantity_has_unit"
    t.check_constraint "quantity > 0::numeric", name: "shopping_list_items_quantity_positive"
    t.check_constraint "unit::text = ANY (ARRAY['g'::character varying, 'ml'::character varying, 'stuks'::character varying, 'tl'::character varying, 'el'::character varying]::text[])", name: "shopping_list_items_unit_known"
  end

  create_table "standard_items", force: :cascade do |t|
    t.string "name", null: false
    t.string "category"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_standard_items_on_name", unique: true
  end

  create_table "steps", force: :cascade do |t|
    t.bigint "recipe_id", null: false
    t.integer "position", null: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false

    t.check_constraint "\"position\" > 0", name: "steps_position_positive"
    t.unique_constraint ["recipe_id", "position"], deferrable: :deferred, name: "steps_recipe_id_position_unique"
  end

  create_table "tags", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_tags_on_name", unique: true
  end

  create_table "variation_changes", force: :cascade do |t|
    t.bigint "recipe_variation_id", null: false
    t.string "kind", null: false
    t.bigint "recipe_ingredient_id"
    t.string "name"
    t.decimal "quantity", precision: 10, scale: 2
    t.string "unit"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recipe_ingredient_id"], name: "index_variation_changes_on_recipe_ingredient_id"
    t.index ["recipe_variation_id", "recipe_ingredient_id"], name: "index_variation_changes_on_variation_and_recipe_ingredient", unique: true
    t.check_constraint "(quantity IS NULL) = (unit IS NULL)", name: "variation_changes_quantity_has_unit"
    t.check_constraint "kind::text = 'remove'::text AND recipe_ingredient_id IS NOT NULL AND name IS NULL AND quantity IS NULL AND unit IS NULL OR kind::text = 'add'::text AND recipe_ingredient_id IS NULL AND name IS NOT NULL", name: "variation_changes_fields_match_kind"
    t.check_constraint "kind::text = ANY (ARRAY['add'::character varying, 'remove'::character varying]::text[])", name: "variation_changes_kind_known"
    t.check_constraint "quantity > 0::numeric", name: "variation_changes_quantity_positive"
    t.check_constraint "unit::text = ANY (ARRAY['g'::character varying, 'ml'::character varying, 'stuks'::character varying, 'tl'::character varying, 'el'::character varying]::text[])", name: "variation_changes_unit_known"
  end

  create_table "variation_tag_changes", force: :cascade do |t|
    t.bigint "recipe_variation_id", null: false
    t.bigint "tag_id", null: false
    t.string "kind", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recipe_variation_id", "tag_id"], name: "index_variation_tag_changes_on_recipe_variation_id_and_tag_id", unique: true
    t.index ["tag_id"], name: "index_variation_tag_changes_on_tag_id"
    t.check_constraint "kind::text = ANY (ARRAY['add'::character varying, 'remove'::character varying]::text[])", name: "variation_tag_changes_kind_known"
  end

  add_foreign_key "recipe_ingredients", "ingredients"
  add_foreign_key "recipe_ingredients", "recipes"
  add_foreign_key "recipe_tags", "recipes"
  add_foreign_key "recipe_tags", "tags"
  add_foreign_key "recipe_variations", "recipes", on_delete: :cascade
  add_foreign_key "recipe_versions", "recipes", on_delete: :cascade
  add_foreign_key "recipes", "categories"
  add_foreign_key "shopping_list_items", "recipes", on_delete: :nullify
  add_foreign_key "steps", "recipes"
  add_foreign_key "variation_changes", "recipe_ingredients", on_delete: :cascade
  add_foreign_key "variation_changes", "recipe_variations", on_delete: :cascade
  add_foreign_key "variation_tag_changes", "recipe_variations", on_delete: :cascade
  add_foreign_key "variation_tag_changes", "tags"
end
