#!/usr/bin/env bash
# The RangerDOM renderer's dependencies (opt-in: only the rg_web `dom`
# feature uses them, the phone build and the default web build do not).
#
#   .deps/RangerDOM         terotests/RangerDOM: js/ (the DOM for scripts,
#                           webapi.js), json/ and view/ (the render tree as EVG)
#   .deps/domtree/          a small Ranger-shaped tree for those crates:
#     lib/evg               EVG at the commit RangerDOM's playground is pinned to
#                           (newer than the engine's .deps/Ranger/lib/evg)
#     runtime/rust/rangerevg  that EVG as a crate (a copy of Ranger's)
#     gallery/domjson, gallery/domview  RangerDOM's json/ and view/
#   Every crate names the one `ranger` runtime in .deps/Ranger, so CErXes,
#   the engine and RangerDOM share it.
#
# Needs scripts/setup.sh first (for .deps/Ranger). RANGERDOM_DIR / EVG_DIR
# name checkouts of your own instead.
set -euo pipefail
cd "$(dirname "$0")/.."
RD_REV=0ee1ed37233217ac8fbd8b98294a2911a102bccd
EVG_REV=74afb113406b37d048adbf901ac528501f63256f
[[ -d .deps/Ranger/runtime/rust/ranger ]] || { echo "run scripts/setup.sh first" >&2; exit 1; }
ROOT="$(pwd)"
RANGER_RT="$ROOT/.deps/Ranger/runtime/rust/ranger"

fetch() { # dir url rev
  local dir="$1"
  if [[ -L "$dir" ]]; then return; fi
  if [[ ! -d "$dir/.git" ]]; then git clone -q --filter=blob:none --no-checkout "$2" "$dir"; fi
  # (a --no-checkout clone's HEAD may already be the commit, with no files)
  if [[ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" != "$3" || -z "$(ls "$dir")" ]]; then
    git -C "$dir" fetch -q --filter=blob:none origin "$3" 2>/dev/null || git -C "$dir" fetch -q origin
    git -C "$dir" checkout -q -f "$3"
  fi
}

if [[ -n "${RANGERDOM_DIR:-}" ]]; then ln -sfn "$(cd "$RANGERDOM_DIR" && pwd)" .deps/RangerDOM; else fetch .deps/RangerDOM https://github.com/terotests/RangerDOM.git "$RD_REV"; fi
if [[ -n "${EVG_DIR:-}" ]]; then ln -sfn "$(cd "$EVG_DIR" && pwd)" .deps/evg-dom; else fetch .deps/evg-dom https://github.com/terotests/evg.git "$EVG_REV"; fi

T=.deps/domtree
mkdir -p "$T/lib" "$T/runtime/rust" "$T/gallery"
ln -sfn "$ROOT/.deps/evg-dom/storm" "$T/lib/evg"
# the crates, copied (their relative paths lead into this tree), with the
# runtime named by its one path
copy_crate() { # from to
  rm -rf "$2"; mkdir -p "$2"; cp -r "$1"/. "$2"/
  sed -i.bak -E "s#path = \"[./]*runtime/rust/ranger\"#path = \"$RANGER_RT\"#; s#path = \"\.\./ranger\"#path = \"$RANGER_RT\"#" "$2/Cargo.toml"
  rm -f "$2/Cargo.toml.bak"
}
copy_crate .deps/Ranger/runtime/rust/rangerevg "$T/runtime/rust/rangerevg"
copy_crate .deps/RangerDOM/json "$T/gallery/domjson"
copy_crate .deps/RangerDOM/view "$T/gallery/domview"
echo "ready: .deps/RangerDOM ($(git -C .deps/RangerDOM rev-parse --short HEAD)), EVG for it ($(git -C .deps/evg-dom rev-parse --short HEAD)) in $T"
