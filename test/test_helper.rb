ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...

    # How many SQL queries the block does (without schema and transaction queries), to show
    # that a list does not do one query per row.
    def count_queries(&block)
      count = 0
      counter = ->(*, payload) { count += 1 unless payload[:name].in?([ "SCHEMA", "TRANSACTION" ]) }
      ActiveSupport::Notifications.subscribed(counter, "sql.active_record", &block)
      count
    end
  end
end

# For the rake task tests (test/tasks): runs a task with these ENV values, like
# `NAME=value bin/rails task` on the command line, and returns what it printed. The old
# ENV values are put back afterwards. Load the tasks first (Rails.application.load_tasks).
module TaskTestHelper
  def run_task(name, **env)
    env = env.transform_keys(&:to_s)
    old = env.keys.index_with { |key| ENV[key] }
    env.each { |key, value| ENV[key] = value }
    Rake::Task[name].reenable
    capture_io { Rake::Task[name].invoke }.first
  ensure
    old.each { |key, value| ENV[key] = value }
  end
end
