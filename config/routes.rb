Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    resources :recipes, only: %i[ index show create ]

    namespace :admin do
      resources :recipes, only: %i[ index show update destroy ] do
        member do
          patch :approve
          patch :reject
        end
      end
    end

    # Unknown API paths get a JSON 404, never the frontend's index.html.
    match "*path", to: "not_found#show", via: :all
  end

  # The Vue app. Existing files in public/ (assets, favicon) never get here, because
  # ActionDispatch::Static serves them before routing. The constraint keeps /api and /up
  # out and only answers HTML requests, so a missing /assets/x.js stays a plain 404.
  root "frontend#index"
  get "*path", to: "frontend#index", constraints: ->(request) {
    !request.path.match?(%r{\A/(api|up)(/|\z)}) && request.format.html?
  }
end
