require "test_helper"

class NevoFoodTest < ActiveSupport::TestCase
  test "search matches every word in the name or the synonym, best match first" do
    assert_equal [ nevo_foods(:kippenei) ], NevoFood.search("kippenei").to_a
    assert_equal [ nevo_foods(:kippenei) ], NevoFood.search("ei rauw").to_a
    assert_equal [ nevo_foods(:tarwebloem) ], NevoFood.search("tarwebloem").to_a
    # "melk" starts a name; "Drinkvoeding" has no melk at all.
    assert_equal [ nevo_foods(:melk) ], NevoFood.search("MELK").to_a
    assert_empty NevoFood.search("  ")
    # LIKE characters are just text.
    assert_empty NevoFood.search("%")
  end

  test "a name that starts with the search comes before one that only contains it" do
    contains = NevoFood.create!(code: 1, name: "Pannenkoek m bloem", unit: "g", version: "x")

    assert_equal [ nevo_foods(:tarwebloem), contains ], NevoFood.search("bloem").to_a
  end

  test "citation version and readable name" do
    assert_equal "2025/9.0", NevoFood.citation_version("NEVO-Online 2025 9.0")
    assert_equal "Kippeneieren rauw", nevo_foods(:kippenei).display_name
    assert_equal "Melk halfvolle", nevo_foods(:melk).display_name
  end
end
