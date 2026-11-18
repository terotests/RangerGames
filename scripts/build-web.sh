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
  wasm-opt -O2 --strip-debug --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "$OUT/rg_web.wasm" -o "$OUT/rg_web.wasm" || true
fi
# The engine with the RangerDOM renderer (crates/rg_web_dom) is the web's
# engine, rg_web.wasm; the one that lays out with EVG directly is kept as
# rg_web_evg.wasm (?evg=1). Only when its dependencies are there
# (scripts/setup-dom.sh): without them, or when its build fails, rg_web.wasm
# stays the EVG one
if [[ -d .deps/domtree && -d .deps/RangerDOM ]]; then
  if (cd crates/rg_web_dom && CARGO_TARGET_DIR=../../target/dom cargo build --lib --target wasm32-wasip1 "${FLAGS[@]}"); then
    cp "target/dom/wasm32-wasip1/$PROFILE/rg_web_dom.wasm" "$OUT/rg_web_dom.wasm"
    if command -v wasm-opt >/dev/null 2>&1 && [[ "$PROFILE" == release ]]; then
      wasm-opt -O2 --strip-debug --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "$OUT/rg_web_dom.wasm" -o "$OUT/rg_web_dom.wasm" || true
    fi
  else
    echo "note: rg_web_dom.wasm (the RangerDOM renderer) not built: rg_web.wasm is the EVG engine"
  fi
fi
cp "$OUT/rg_web.wasm" "$OUT/rg_web_evg.wasm"
if [[ -f "$OUT/rg_web_dom.wasm" ]]; then mv "$OUT/rg_web_dom.wasm" "$OUT/rg_web.wasm"; fi
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
# them, so the page does not wait for them. (The Android
# app packs everything, see build-android.sh: it works offline.)
if [[ "$GAMES" == games ]]; then
  GAMES=dist/games-web
  rm -rf "$GAMES"; mkdir -p "$GAMES"; cp -r games/* "$GAMES/"
fi
if [[ -d "$GAMES/_voice" ]]; then
  (cd "$GAMES" && find _voice -name '*.wav' | while read -r f; do mkdir -p "../web/games/$(dirname "$f")"; mv "$f" "../web/games/$f"; done)
fi
# games.rgpk holds only what the launcher needs: the launcher, the shared
# folders (_voice/…) and every game's game.json and tile picture. Each game's
# files are a pack of their own, packs/<id>.rgpk, which the page fetches when
# the game is first opened (the game's _pack.url names it; the engine asks
# the host for it), so the page starts after the engine and ~0.1 MB instead
# of every game's pictures (~20 MB). The Android app packs everything.
BASE=dist/games-base
rm -rf "$BASE" "$OUT/packs"; mkdir -p "$BASE" "$OUT/packs"
SIZES="\"rg_web.wasm\": $(stat -c %s "$OUT/rg_web.wasm")"
for d in "$GAMES"/*/; do
  id=$(basename "$d")
  if [[ "$id" == launcher || "$id" == _* || ! -f "$d/game.json" ]]; then cp -r "$d" "$BASE/"; continue; fi
  mkdir -p "$BASE/$id"
  cp "$d/game.json" "$BASE/$id/"
  img=$(node -e 'try { process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).image || "")) } catch (e) {}' "$d/game.json")
  if [[ -n "$img" && -f "$d/$img" ]]; then mkdir -p "$BASE/$id/$(dirname "$img")"; cp "$d/$img" "$BASE/$id/$img"; fi
  printf 'packs/%s.rgpk' "$id" > "$BASE/$id/_pack.url"
  ./target/release/rg_cli pack "$d" "$OUT/packs/$id.rgpk" >/dev/null
  SIZES="$SIZES, \"packs/$id.rgpk\": $(stat -c %s "$OUT/packs/$id.rgpk")"
done
./target/release/rg_cli pack "$BASE" "$OUT/games.rgpk"
# the real sizes for the loading screen's percentage (host.js)
SIZES="$SIZES, \"rg_web_evg.wasm\": $(stat -c %s "$OUT/rg_web_evg.wasm")"
echo "{$SIZES, \"games.rgpk\": $(stat -c %s "$OUT/games.rgpk")}" > "$OUT/sizes.json"
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
# every game's own page, peli/<id>/: a direct link that opens the game in
# the full window (mobile mode) on that page, phone or computer, with no
# redirect. The page is index.html with <base href="../../"> and RG_PAGE.
node -e '
const fs = require("fs"), path = require("path");
const [out, dir] = process.argv.slice(1);
const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
let n = 0;
for (const d of fs.readdirSync(dir)) {
  const f = path.join(dir, d, "game.json");
  if (d === "launcher" || !/^[a-z0-9_-]+$/.test(d) || !fs.existsSync(f)) continue;
  const g = JSON.parse(fs.readFileSync(f, "utf8")), name = g.name || d;
  const head = `<base href="../../">\n<script>window.RG_PAGE = ${JSON.stringify({ game: d, mode: "mobile" })};</script>`;
  const page = html.replace("<head>", "<head>\n" + head)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(name)} · RangerGames</title>` +
      (g.description ? `\n<meta name="description" content="${esc(g.description)}">` : ""));
  fs.mkdirSync(path.join(out, "peli", d), { recursive: true });
  fs.writeFileSync(path.join(out, "peli", d, "index.html"), page);
  n++;
}
console.log("peli/: " + n + " game pages");
' "$OUT" "$GAMES"
# the font and three.js beside the page, so the Android app works offline
# (best effort: without a network the page falls back to Google Fonts / the CDN)
mkdir -p "$OUT/fonts" "$OUT/vendor"
curl -sSfL -o "$OUT/fonts/Fredoka.ttf" "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" \
  && curl -sSfL -o "$OUT/fonts/OFL.txt" "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt" \
  || echo "note: Fredoka not downloaded (offline?)"
curl -sSfL -o "$OUT/vendor/three.min.js" "https://unpkg.com/three@0.149.0/build/three.min.js" \
  || echo "note: three.js not downloaded (offline?)"
echo "dist/web: $(du -sh "$OUT" | cut -f1)  (serve it: npx serve dist/web, or python3 -m http.server -d dist/web; playground: /playground.html)"
