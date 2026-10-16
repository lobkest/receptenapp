# [{ "name": "Tomaten", "category": "Groente & fruit" }]
# StandardItem stores name and category in lower case ("tomaten", "groente & fruit"), so
# an existing name or category is found in any case and with any spaces.
module Importers
  class StandardItems < Base
    FIELDS = %w[ name category ].freeze

    private
      def import(row, line)
        reject_unknown_keys!(row, FIELDS, "item")

        item = StandardItem.new(name: row["name"], category: row["category"])
        if item.invalid? && item.errors.of_kind?(:name, :taken)
          return report.skipped!(line, item.name, "bestaat al")
        end

        new_category = item.category && !StandardItem.exists?(category: item.category)
        item.save!

        report.created!(line, [ item.name, item.category ].compact.join(" — "))
        report.new_categories << item.category if new_category
      end

      def label(row)
        row["name"].to_s
      end
  end
end
