#!/usr/bin/env bash
# Stage the runtime files into ./public and publish to Cloudflare.
# Run `npx wrangler login` once first.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf public
mkdir -p public/vendor
cp index.html style.css ./*.js public/
cp vendor/three.min.js public/vendor/

# Binary assets. The game is otherwise fully procedural, but the title key
# art lives in art/ and the intro narration in audio/. Without these the
# title screen falls back to its typed heading -- which still works, but is
# not what you want in front of judges.
[ -d art ]   && { mkdir -p public/art;   cp art/*   public/art/   2>/dev/null || true; }
[ -d audio ] && { mkdir -p public/audio; cp audio/* public/audio/ 2>/dev/null || true; }
[ -d video ] && { mkdir -p public/video; cp video/* public/video/ 2>/dev/null || true; }

# Cloudflare Pages rejects any single file over 25 MiB. Warn loudly rather
# than letting the upload fail halfway through.
for f in $(find public -type f -size +25M 2>/dev/null); do
  echo "WARNING: $f is over 25 MiB - Cloudflare Pages will reject it. Compress it before deploying." >&2
done
# Only the served cut of the film, never the pre-faststart original.
[ -d video ] && { mkdir -p public/video; cp video/atlas-intro.mp4 public/video/ 2>/dev/null || true; }

echo "staged $(find public -type f | wc -l | tr -d ' ') files into ./public"
npx --yes wrangler@latest deploy "$@"
