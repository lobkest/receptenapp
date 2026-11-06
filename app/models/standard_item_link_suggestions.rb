# Which standard items are probably an existing ingredient under another name ("uien" and
# the ingredient "ui"), for "Mogelijk hetzelfde" on the standard list. Only suggestions: the
# link is made by hand (StandardItem#link_to!).
#
#   StandardItemLinkSuggestions.call
#   # => [ { item: <StandardItem uien>, candidates: [ <Ingredient ui> ] } ]
#
# Candidates for an item that is not linked yet and whose name is not an ingredient itself
# (that one already matches by name):
# - the same name after a plural ending is taken off each word ("uien"/"ui", "foto's"/"foto");
# - or the words of one name appear, in order and as whole words, in the other ("ui" in
#   "rode ui", "melk" in "halfvolle melk").
# Rejected pairs (StandardItemLinkRejection) are skipped. At most MAX_CANDIDATES per item,
# the same stem first, then by name.
#
# In Ruby, not SQL: a few hundred ingredients against a short list is quick enough, and a
# stem is easier to read here than in a regular expression in Postgres.
class StandardItemLinkSuggestions
  MAX_CANDIDATES = 3
  # Longest first: "'s" before "s".
  PLURAL_ENDINGS = %w[ 's en s ].freeze
  # A stem shorter than this is not a word any more ("es" → "e").
  MIN_STEM = 2

  def self.call
    new.call
  end

  # "uien" → "ui", "foto's" → "foto", "appels" → "appel". Only one ending, so "eieren" is
  # "eier", not "ei": a suggestion too few is better than a wrong one.
  def self.stem(word)
    PLURAL_ENDINGS.each do |ending|
      next unless word.end_with?(ending)

      stem = word.delete_suffix(ending)
      return stem if stem.length >= MIN_STEM
    end
    word
  end

  def self.words(name)
    name.to_s.downcase.split(/[^[:alnum:]']+/).compact_blank.map { |word| stem(word) }
  end

  def call
    items = StandardItem.where(ingredient_id: nil).where.not(name: Ingredient.select(:name)).order(:name).to_a
    return [] if items.empty?

    ingredients = Ingredient.order(:name).pluck(:id, :name).map { |id, name| [ id, name, self.class.words(name) ] }
    rejected = StandardItemLinkRejection.where(standard_item_id: items.map(&:id)).pluck(:standard_item_id, :ingredient_id).to_set
    found = ingredients_by_id(items, ingredients, rejected)
    # One query for all candidates, not one per item.
    candidates = Ingredient.where(id: found.values.flatten.uniq).index_by(&:id)

    items.filter_map do |item|
      { item: item, candidates: candidates.values_at(*found[item.id]) } if found.key?(item.id)
    end
  end

  private
    # { standard_item_id => [ ingredient ids, best first ] }
    def ingredients_by_id(items, ingredients, rejected)
      items.each_with_object({}) do |item, found|
        words = self.class.words(item.name)
        matches = ingredients.filter_map do |id, name, ingredient_words|
          next if rejected.include?([ item.id, id ])

          if words == ingredient_words
            [ 0, name, id ]
          elsif contains?(words, ingredient_words) || contains?(ingredient_words, words)
            [ 1, name, id ]
          end
        end
        found[item.id] = matches.sort.first(MAX_CANDIDATES).map(&:last) if matches.any?
      end
    end

    # The words of part, in order and next to each other, in whole.
    def contains?(whole, part)
      return false if part.empty? || part.length >= whole.length

      whole.each_cons(part.length).include?(part)
    end
end
