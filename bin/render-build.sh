#!/usr/bin/env bash
set -o errexit

bundle install

# Build the Vue frontend. --include=dev because Vite itself is a devDependency.
echo "Node $(node -v), npm $(npm -v)"
(cd frontend && npm ci --include=dev && npm run build)

# Copy the build into public/ so ActionDispatch::Static serves it. Old hashed assets are
# removed first; robots.txt stays. index.html is not copied: FrontendController serves it
# from frontend/dist with no-cache, so browsers always pick up the newest asset names.
rm -rf public/assets
cp -r frontend/dist/. public/
rm -f public/index.html

bin/rails db:migrate
