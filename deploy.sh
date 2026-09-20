#!/usr/bin/env bash
# Stage the runtime files into ./public and publish to Cloudflare.
# Run `npx wrangler login` once first.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf public
mkdir -p public/vendor
cp index.html style.css ./*.js public/
cp vendor/three.min.js public/vendor/

echo "staged $(find public -type f | wc -l | tr -d ' ') files into ./public"
npx --yes wrangler@latest deploy "$@"
