# vegetarisch excludes vlees: a recipe with kip is not vegetarisch. A tag with at least
# one exclusion is automatic (Tag#automatic?).
class TagExclusion < ApplicationRecord
  belongs_to :tag
  belongs_to :trait
end
