class ApplicationController < ActionController::API
  include ApiErrors
  include ClientIp
end
