# Imports rows from a JSON file through the models, so validations and the recipe
# history work as in the app. Subclasses implement import(row, line) for one row.
#
#   report = Importers::StandardItems.from_file("db/import/standaardlijst.json", dry_run: true)
#   puts report
#
# Everything runs in one transaction; dry_run rolls it back at the end. Each row gets its
# own savepoint, so a row that fails is rolled back and reported, and the rest goes on.
module Importers
  class Base
    # A row the import refuses itself (for example a unit other than g or ml).
    class Rejected < StandardError
      attr_reader :messages

      def initialize(messages)
        @messages = Array(messages)
        super(@messages.join("; "))
      end
    end

    # "Database: receptenapp_development (localhost), omgeving development": the first line
    # of every rake task that writes, so you see where it goes before anything changes.
    def self.database_line
      config = ActiveRecord::Base.connection_db_config
      "Database: #{config.database} (#{config.host || 'localhost'}), omgeving #{Rails.env}"
    end

    def self.from_file(path, dry_run: false)
      call(JSON.parse(File.read(path)), dry_run: dry_run)
    end

    # rows: the parsed JSON, an array of objects. Returns a Report.
    def self.call(rows, dry_run: false)
      new(dry_run: dry_run).call(rows)
    end

    def initialize(dry_run:)
      @report = Report.new(dry_run: dry_run)
    end

    def call(rows)
      raise ArgumentError, "het bestand moet een JSON-array zijn" unless rows.is_a?(Array)

      # requires_new: inside another transaction (a test) Rollback would otherwise do nothing.
      ApplicationRecord.transaction(requires_new: true) do
        rows.each.with_index(1) { |row, line| import_row(row, line) }
        raise ActiveRecord::Rollback if report.dry_run?
      end
      report
    end

    private
      attr_reader :report

      def import_row(row, line)
        return report.failed!(line, row.inspect, "geen JSON-object") unless row.is_a?(Hash)

        ApplicationRecord.transaction(requires_new: true) { import(row, line) }
      rescue Rejected => error
        report.failed!(line, label(row), error.messages)
      rescue ActiveRecord::RecordInvalid => error
        report.failed!(line, label(row), error.record.errors.full_messages)
      rescue ActiveRecord::StatementInvalid => error
        report.failed!(line, label(row), error.message.lines.first.strip)
      end

      # Keys the model has no place for: probably a typo, so the row is refused.
      def reject_unknown_keys!(hash, allowed, where)
        raise Rejected, "#{where}: geen JSON-object" unless hash.is_a?(Hash)

        unknown = hash.keys - allowed
        raise Rejected, "#{where}: onbekende velden #{unknown.join(', ')}" if unknown.any?
      end
  end
end
