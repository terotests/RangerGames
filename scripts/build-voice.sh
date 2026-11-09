#!/usr/bin/env bash
# Renders the voice clips of rg.say with crates/rg_voice (only changed clips are
# rendered again): voice/fi.json → games/_voice/fi, and every language folder
# voice/<lang>/ (all its *.json lists merged, English also reads its *.dict
# word lists) → games/_voice/<lang>. build-web.sh and build-android.sh run it.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build -q --release -p rg_voice
# a list with "engine": "piper" needs Piper (rg_voice falls back to CHIMERA without it)
if grep -qs '"engine": *"piper"' voice/fi.json voice/*/*.json && [[ -z "${RG_PIPER:-}" ]]; then
  scripts/setup-piper.sh || echo "build-voice: Piper not installed, CHIMERA says its clips"
fi
./target/release/rg_voice build voice/fi.json games/_voice/fi
for d in voice/*/; do
  lang=$(basename "$d")
  ls "$d"*.json >/dev/null 2>&1 || continue
  ./target/release/rg_voice build "$d" "games/_voice/$lang"
done
