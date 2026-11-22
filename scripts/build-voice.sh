#!/usr/bin/env bash
# Renders the voice clips of rg.say with crates/rg_voice (only changed clips are
# rendered again): voice/fi.json → games/_voice/fi, and every language folder
# voice/<lang>/ (all its *.json lists merged, English also reads its *.dict
# word lists) → games/_voice/<lang>. build-web.sh and build-android.sh run it.
#
# The clips are a cache, not part of every build: games/_voice is a link to
# RG_VOICE_CACHE (default ~/.cache/rangergames/voice), shared by every checkout
# and worktree. When that cache is empty, the clips CI made (release
# phone-latest, voice-clips.tar.gz) are fetched first, so only clips whose text
# changed since are rendered here. RG_VOICE_FETCH=0 skips the download.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${CI:-}" && ! -e games/_voice && ! -L games/_voice ]]; then
  cache="${RG_VOICE_CACHE:-$HOME/.cache/rangergames/voice}"
  mkdir -p "$cache"
  ln -s "$cache" games/_voice
fi
if [[ "${RG_VOICE_FETCH:-1}" != "0" && -z "$(ls -A games/_voice/ 2>/dev/null)" ]]; then
  url="https://github.com/terotests/RangerGames/releases/download/phone-latest/voice-clips.tar.gz"
  echo "build-voice: fetching the clips CI made ($url)"
  mkdir -p games/_voice
  curl -fsSL "$url" | tar -xz -C games/_voice/ || echo "build-voice: no clips from CI, rendering them"
fi
cargo build -q --release -p rg_voice
# a list with "engine": "piper" needs Piper (rg_voice falls back to CHIMERA without it)
# (voice/fi.json says "engine": "piper"; English and Spanish use it by default)
if [[ -z "${RG_PIPER:-}" ]]; then
  scripts/setup-piper.sh || echo "build-voice: Piper not installed, CHIMERA says its clips"
fi
./target/release/rg_voice build voice/fi.json games/_voice/fi
for d in voice/*/; do
  lang=$(basename "$d")
  ls "$d"*.json >/dev/null 2>&1 || continue
  ./target/release/rg_voice build "$d" "games/_voice/$lang"
done
