Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    # Public: anyone may add and edit. Deleting is only a request; see admin below.
    resources :recipes, only: %i[ index show create update ] do
      member do
        post :request_deletion
        post :add_to_shopping_list
      end

      resources :variations, only: %i[ create update ], controller: "recipe_variations" do
        member do
          post :request_deletion
          post :add_to_shopping_list
        end
      end
    end
    resources :tags, only: :index
    resources :categories, only: :index
    # Nutrition: linking ingredients to NEVO-online, open to anyone like recipes.
    resources :ingredients, only: %i[ index show update ] do
      # Traits for the automatic tags (vlees, gluten, ...), separate from the NEVO settings.
      patch :traits, on: :member, action: :update_traits
      # Basisvoorraad (zout, olijfolie, ...): in the house unless it is out. Like traits.
      patch :staple, on: :member, action: :update_staple
    end
    resources :traits, only: :index
    # "In huis": one stock for everybody, like the shopping list (no code needed).
    resource :pantry, only: :show, controller: "pantry" do
      get :recipes
      post :reset
      patch "ingredients/:ingredient_id", action: :update_ingredient, as: :ingredient
    end
    resources :nevo_foods, only: :index
    # Which frontend build belongs to this server; see lib/app_version.rb.
    resource :version, only: :show

    # Public, no code needed: anyone with the link shares these two lists.
    resources :shopping_list_items, only: %i[ index create update destroy ] do
      collection do
        delete :clear_checked
        delete :clear_all
      end
    end

    resources :standard_items, only: %i[ index create update destroy ] do
      # POST, not DELETE: a DELETE request with a body is not reliably passed on.
      post :bulk_destroy, on: :collection
    end

    # Only with the admin code: deletion requests and versions.
    namespace :admin do
      resources :deletion_requests, only: :index
      # Merging deletes the source ingredient, so it needs the code too.
      resources :ingredients, only: [] do
        post :merge, on: :member
      end

      resources :variations, only: :destroy, controller: "recipe_variations" do
        patch :restore, on: :member
      end

      resources :recipes, only: :destroy do
        patch :restore, on: :member
        resources :versions, only: :index, controller: "recipe_versions" do
          post :restore, on: :member
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
