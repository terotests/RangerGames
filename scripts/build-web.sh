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
# the Finnish voice clips of rg.say (voice/fi.json → games/_voice/fi; only changed clips are rendered)
cargo run -q --release -p rg_voice -- build voice/fi.json games/_voice/fi
OUT=dist/web
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r web/* "$OUT"/
cp "target/wasm32-wasip1/$PROFILE/rg_web.wasm" "$OUT/rg_web.wasm"
if command -v wasm-opt >/dev/null 2>&1 && [[ "$PROFILE" == release ]]; then
  wasm-opt -O2 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "$OUT/rg_web.wasm" -o "$OUT/rg_web.wasm" || true
fi
./target/release/rg_cli pack games "$OUT/games.rgpk"
# the games' list for the playground (playground.html): every game.json not hidden
node -e '
const fs = require("fs"), path = require("path");
const list = fs.readdirSync("games").filter(d => fs.existsSync(path.join("games", d, "game.json"))).map(d => {
  const g = JSON.parse(fs.readFileSync(path.join("games", d, "game.json"), "utf8"));
  return { id: d, name: g.name || d, description: g.description || "", icon: g.icon || "", color: g.color || "", players: g.players || "1", order: g.order || 0, hidden: !!g.hidden };
}).filter(g => !g.hidden).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fi"));
fs.writeFileSync(process.argv[1], JSON.stringify(list.map(({ hidden, ...g }) => g), null, 1));
' "$OUT/games.json"
# the font and three.js beside the page, so the Android app works offline
# (best effort: without a network the page falls back to Google Fonts / the CDN)
mkdir -p "$OUT/fonts" "$OUT/vendor"
curl -sSfL -o "$OUT/fonts/Fredoka.ttf" "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" \
  && curl -sSfL -o "$OUT/fonts/OFL.txt" "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt" \
  || echo "note: Fredoka not downloaded (offline?)"
curl -sSfL -o "$OUT/vendor/three.min.js" "https://unpkg.com/three@0.149.0/build/three.min.js" \
  || echo "note: three.js not downloaded (offline?)"
echo "dist/web: $(du -sh "$OUT" | cut -f1)  (serve it: npx serve dist/web, or python3 -m http.server -d dist/web; playground: /playground.html)"
