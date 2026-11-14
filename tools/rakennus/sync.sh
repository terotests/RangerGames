#!/usr/bin/env bash
# Copies the shared kit of the Rakennuspelit games into each of them:
# tools/rakennus/kit.tsx -> games/<g>/lib/kit.tsx, kit.css -> games/<g>/style.css
# (a game can only import files from its own folder). Run after changing kit.*.
set -euo pipefail
cd "$(dirname "$0")/../.."
for g in ruuvit vasara jakoavain mittaus sahat pora tyomaa; do
  [[ -d games/$g ]] || continue
  mkdir -p games/$g/lib
  { echo "// GENERATED from tools/rakennus/kit.tsx by tools/rakennus/sync.sh: edit that file, not this copy."; cat tools/rakennus/kit.tsx; } > games/$g/lib/kit.tsx
  { echo "/* GENERATED from tools/rakennus/kit.css by tools/rakennus/sync.sh */"; cat tools/rakennus/kit.css; } > games/$g/style.css
done
echo synced
