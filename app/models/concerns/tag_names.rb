# Tag names as people send them ("  Vega ", "snel", "vega"): normalized like Tag#name
# and checked against the same rules, so the errors land on the model that received the
# names ("tag_names", "added_tag_names") before any Tag is created.
# Used by Recipe (its own tags) and RecipeVariation (tags it adds or takes off).
#
#   class Recipe < ApplicationRecord
#     include TagNames
#
#     def tag_names=(names)
#       @tag_names = normalize_tag_names(names)
#     end
#
#     validate { validate_tag_names(:tag_names, @tag_names, max: MAX_TAGS) }
#   end
module TagNames
  extend ActiveSupport::Concern

  class_methods do
    # ["  Vega ", "", "vega", "Snel"] → ["vega", "snel"]: like Tag#name, without empty
    # names and doubles.
    def normalize_tag_names(names)
      Array.wrap(names).map { |name| Tag.normalize_value_for(:name, name.to_s) }.compact_blank.uniq
    end
  end

  private
    def normalize_tag_names(names)
      self.class.normalize_tag_names(names)
    end

    # Too many names, a name that is too long, or one with a comma (the filter sends
    # several tags as ?tags=vega,snel). A block can add its own check per name first.
    def validate_tag_names(attribute, names, max:)
      errors.add(attribute, :too_many_tags, count: max) if names.size > max

      names.each do |name|
        yield name if block_given?
        errors.add(attribute, :tag_too_long, name: name, count: Tag::MAX_NAME_LENGTH) if name.length > Tag::MAX_NAME_LENGTH
        errors.add(attribute, :tag_with_comma, name: name) if name.include?(",")
      end
    end
end
