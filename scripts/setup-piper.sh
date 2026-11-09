#!/usr/bin/env bash
# Installs Piper (github.com/OHF-Voice/piper1-gpl, GPL-3.0, a build tool only:
# nothing of it goes into the games) and its Finnish voice in .deps/piper:
#   .deps/piper/venv     a Python venv with piper-tts
#   .deps/piper/models   fi_FI-harri-medium, en_US-ljspeech-medium, es_ES-davefx-medium
#                        (.onnx + .onnx.json + MODEL_CARD with each voice's licence)
# rg_voice build uses it for a clip list whose voice says "engine": "piper".
# build-voice.sh runs this when it is needed; a failure (no network) leaves
# CHIMERA saying those clips.
set -euo pipefail
cd "$(dirname "$0")/.."
D=.deps/piper
VOICES="${PIPER_VOICES:-fi_FI-harri-medium en_US-ljspeech-medium es_ES-davefx-medium}"
HF=https://huggingface.co/rhasspy/piper-voices/resolve/main
mkdir -p "$D/models"
if [[ ! -x "$D/venv/bin/piper" ]]; then
  python3 -m venv "$D/venv"
  "$D/venv/bin/pip" install -q --timeout 30 "piper-tts==1.8.0"
fi
for v in $VOICES; do
  # fi_FI-harri-medium → fi/fi_FI/harri/medium
  IFS=- read -r loc name quality <<<"$v"
  path="${loc%%_*}/$loc/$name/$quality"
  for f in "$v.onnx" "$v.onnx.json" MODEL_CARD; do
    out="$D/models/$f"; [[ $f == MODEL_CARD ]] && out="$D/models/$v.MODEL_CARD"
    if [[ ! -s "$out" ]] && curl -fsSL --max-time 600 -o "$out.part" "$HF/$path/$f"; then mv -f "$out.part" "$out"; fi
  done
  [[ -s "$D/models/$v.onnx" && -s "$D/models/$v.onnx.json" ]] || { echo "setup-piper: could not download $v" >&2; exit 1; }
done
echo "ready: $D ($("$D/venv/bin/pip" show piper-tts 2>/dev/null | sed -n 's/^Version: /piper-tts /p'); $VOICES)"
