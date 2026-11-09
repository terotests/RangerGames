#!/usr/bin/env bash
# Checks that rg_core is still in Ranger's strict Rust subset: rgrc reads
# crates/rg_core/src/lib.rs and writes it as JavaScript (and other targets
# with TARGETS="es6 cpp go …"). A [FAIL] names the line and the alternative.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=target/ranger
mkdir -p "$OUT"
for t in ${TARGETS:-es6}; do
  log=$(node .deps/Ranger/dist/rgrc.js -l="$t" -nodemodule crates/rg_core/src/lib.rs -d="$OUT" -o="rg_core.$t" 2>&1) || true
  if echo "$log" | grep -q "FAIL"; then
    echo "$log" | grep -B6 "FAIL" | head -80
    echo "rg_core: not in the Ranger subset for $t"
    exit 1
  fi
  echo "rg_core -> $t: ok ($OUT/rg_core.$t)"
done
# the JavaScript answers what the cargo build answers
node tests/rg_core_js.cjs
