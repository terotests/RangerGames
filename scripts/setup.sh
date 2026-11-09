#!/usr/bin/env bash
# Puts the engine's two source dependencies in .deps/ at the revisions this
# repository was built and tested with:
#
#   .deps/Ranger            the Ranger compiler (rgrc, the `ranger` prelude crate)
#                           and lib/evg (EVG, fetched by Ranger's own `npm run deps`)
#   .deps/ComponentEngine   CErXes, the TypeScript/JSX engine (cerxes/)
#
# Needs git and node. With RANGER_DIR / COMPONENTENGINE_DIR set to existing
# checkouts it links those instead of cloning (for working on all three).
set -euo pipefail
cd "$(dirname "$0")/.."
RANGER_REV=7cc0a2f3f7d95c1f3c56135b4514adb728aacd32
CE_REV=76347766307070beb61747f1919ef26de0644436
mkdir -p .deps

fetch() { # name url rev
  local dir=".deps/$1"
  if [[ -L "$dir" ]]; then return; fi
  if [[ ! -d "$dir/.git" ]]; then
    git clone --filter=blob:none --no-checkout "$2" "$dir"
  fi
  git -C "$dir" fetch --filter=blob:none origin "$3" 2>/dev/null || git -C "$dir" fetch origin
  git -C "$dir" checkout -q "$3"
}

if [[ -n "${RANGER_DIR:-}" ]]; then ln -sfn "$(cd "$RANGER_DIR" && pwd)" .deps/Ranger; else fetch Ranger https://github.com/terotests/Ranger.git "$RANGER_REV"; fi
if [[ -n "${COMPONENTENGINE_DIR:-}" ]]; then ln -sfn "$(cd "$COMPONENTENGINE_DIR" && pwd)" .deps/ComponentEngine; else fetch ComponentEngine https://github.com/terotests/ComponentEngine.git "$CE_REV"; fi

# EVG (lib/evg) and the image codecs come with Ranger's deps step
if [[ ! -f .deps/Ranger/lib/evg/EVGElement.rgr ]]; then
  (cd .deps/Ranger && node scripts/deps.mjs)
fi
echo "ready: .deps/Ranger ($(git -C .deps/Ranger rev-parse --short HEAD)), .deps/ComponentEngine ($(git -C .deps/ComponentEngine rev-parse --short HEAD))"
