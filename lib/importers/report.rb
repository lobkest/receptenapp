# What an import did, printed at the end of the rake task (see lib/tasks/import.rake).
# line is the place of the row in the JSON file, counting from 1.
module Importers
  class Report
    Entry = Data.define(:line, :label, :reason)

    attr_reader :created, :skipped, :failed, :new_ingredients, :new_categories

    def initialize(dry_run:)
      @dry_run = dry_run
      @created = []
      @skipped = []
      @failed = []
      @new_ingredients = []
      @new_categories = []
    end

    def dry_run?
      @dry_run
    end

    def created!(line, label)
      created << Entry.new(line, label, nil)
    end

    def skipped!(line, label, reason)
      skipped << Entry.new(line, label, reason)
    end

    def failed!(line, label, messages)
      failed << Entry.new(line, label, Array(messages).join("; "))
    end

    def to_s
      [
        (dry_run? ? "DRY RUN: alles is teruggedraaid, er is niets opgeslagen." : nil),
        section("Aangemaakt", created),
        section("Overgeslagen", skipped),
        section("Validatiefouten (overgeslagen)", failed),
        section("NIEUWE ingrediënten", new_ingredients),
        section("NIEUWE categorieën", new_categories),
        "Totaal: #{created.size} aangemaakt, #{skipped.size} overgeslagen, #{failed.size} met fouten."
      ].compact.join("\n\n")
    end

    private
      def section(title, entries)
        lines = entries.map { |entry| "  #{entry.is_a?(Entry) ? describe(entry) : entry}" }
        "#{title} (#{entries.size}):\n#{lines.empty? ? '  (geen)' : lines.join("\n")}"
      end

      def describe(entry)
        [ "regel #{entry.line}: #{entry.label}", entry.reason ].compact.join(" — ")
      end
  end
end
