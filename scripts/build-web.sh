#!/usr/bin/env bash
# Builds the web version into dist/web: the engine as WebAssembly, the
# page and its scripts, and every game under games/ in one pack.
#   scripts/build-web.sh            release build
#   scripts/build-web.sh --dev      faster build, slower engine
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE=release
FLAGS=(--release)
if [[ "${1:-}" == "--dev" ]]; then PROFILE=debug; FLAGS=(); fi
cargo build -p rg_web --target wasm32-wasip1 "${FLAGS[@]}"
cargo build -p rg_cli --release
# the voice clips of rg.say (voice/fi.json and voice/<lang>/ → games/_voice/<lang>; only changed clips are rendered)
scripts/build-voice.sh
OUT=dist/web
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r web/* "$OUT"/
cp "target/wasm32-wasip1/$PROFILE/rg_web.wasm" "$OUT/rg_web.wasm"
if command -v wasm-opt >/dev/null 2>&1 && [[ "$PROFILE" == release ]]; then
  wasm-opt -O2 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "$OUT/rg_web.wasm" -o "$OUT/rg_web.wasm" || true
fi
# RG_PUBLIC=1 (GitHub Pages): a public copy of games/ without private games
# (Kolmården with the family photos) and without git-ignored *.local.* files
# (home locations), in case a build is made from a checkout that has them
GAMES=games
if [[ "${RG_PUBLIC:-}" == 1 ]]; then
  GAMES=dist/games-public
  rm -rf "$GAMES"; mkdir -p "$GAMES"
  for d in games/*/; do
    case "$(basename "$d")" in kolmarden|tampere) continue;; esac
    cp -r "$d" "$GAMES/"
  done
  find "$GAMES" \( -name '*.local.*' -o -name perhe \) -prune -exec rm -rf {} +
fi
# The voice clips (games/_voice/*/*.wav, ~70 MB) are not in the pack: they
# are files beside the page that audio.js fetches when a game first says
# them, so the page starts after the engine and a ~20 MB pack. (The Android
# app packs everything, see build-android.sh: it works offline.)
if [[ "$GAMES" == games ]]; then
  GAMES=dist/games-web
  rm -rf "$GAMES"; mkdir -p "$GAMES"; cp -r games/* "$GAMES/"
fi
if [[ -d "$GAMES/_voice" ]]; then
  (cd "$GAMES" && find _voice -name '*.wav' | while read -r f; do mkdir -p "../web/games/$(dirname "$f")"; mv "$f" "../web/games/$f"; done)
fi
./target/release/rg_cli pack "$GAMES" "$OUT/games.rgpk"
# the real sizes for the loading screen's percentage (host.js)
echo "{\"rg_web.wasm\": $(stat -c %s "$OUT/rg_web.wasm"), \"games.rgpk\": $(stat -c %s "$OUT/games.rgpk")}" > "$OUT/sizes.json"
# the games' list for the playground (playground.html): every game.json not hidden
node -e '
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
const list = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, "game.json"))).map(d => {
  const g = JSON.parse(fs.readFileSync(path.join(dir, d, "game.json"), "utf8"));
  return { id: d, name: g.name || d, description: g.description || "", icon: g.icon || "", color: g.color || "", players: g.players || "1", order: g.order || 0, hidden: !!g.hidden };
}).filter(g => !g.hidden).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fi"));
fs.writeFileSync(process.argv[1], JSON.stringify(list.map(({ hidden, ...g }) => g), null, 1));
' "$OUT/games.json" "$GAMES"
# the font and three.js beside the page, so the Android app works offline
# (best effort: without a network the page falls back to Google Fonts / the CDN)
mkdir -p "$OUT/fonts" "$OUT/vendor"
curl -sSfL -o "$OUT/fonts/Fredoka.ttf" "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" \
  && curl -sSfL -o "$OUT/fonts/OFL.txt" "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt" \
  || echo "note: Fredoka not downloaded (offline?)"
curl -sSfL -o "$OUT/vendor/three.min.js" "https://unpkg.com/three@0.149.0/build/three.min.js" \
  || echo "note: three.js not downloaded (offline?)"
echo "dist/web: $(du -sh "$OUT" | cut -f1)  (serve it: npx serve dist/web, or python3 -m http.server -d dist/web; playground: /playground.html)"
