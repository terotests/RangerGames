#!/usr/bin/env bash
# The games that never go to git, as their own pack for the phone: the
# private games (games/kolmarden, games/tampere) and every git-ignored
# *.local.* file or folder (home places, album photos) of the other games.
# The phone's APK (built by CI from main) mounts it over its own games.
#   scripts/private-pack.sh            makes dist/private.rgpk and pushes it with adb
#   scripts/private-pack.sh --no-push  only makes it
# Needs a built rg_cli (cargo build --release -p rg_cli) or cargo to build it.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/private.rgpk
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for g in kolmarden tampere; do
  [[ -d "games/$g" ]] && cp -R "games/$g" "$TMP/"
done
# *.local.* beside the public games (e.g. games/navi/places.local.js)
find games -name '*.local.*' -not -path 'games/kolmarden/*' -not -path 'games/tampere/*' | while read -r f; do
  mkdir -p "$TMP/$(dirname "${f#games/}")"
  cp -R "$f" "$TMP/${f#games/}"
done
mkdir -p dist
[[ -x target/release/rg_cli ]] || cargo build -q --release -p rg_cli
./target/release/rg_cli pack "$TMP" "$OUT"
if [[ "${1:-}" != "--no-push" ]]; then
  adb push "$OUT" /sdcard/Android/data/fi.rangergames/files/private.rgpk
  # the pack is read at boot: a running app must start again to see it
  adb shell am force-stop fi.rangergames
  adb shell monkey -p fi.rangergames -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  echo "pushed and restarted the app"
fi
