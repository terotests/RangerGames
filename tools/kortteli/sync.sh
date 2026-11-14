#!/usr/bin/env bash
# Makes the city board games Mansepoli (games/mansepoli) and Hesapoli
# (games/hesapoli) from one template: copies tools/kortteli/template (game.tsx,
# style.css, lib/rules.ts) and Talot's house data (games/talot/lib/house.ts)
# into both (a game can only import files from its own folder). Each game keeps
# its own game.json and lib/theme.ts. Run after changing the template or Talot.
set -euo pipefail
cd "$(dirname "$0")/../.."
T=tools/kortteli/template
for g in mansepoli hesapoli; do
  mkdir -p games/$g/lib
  for f in game.tsx style.css lib/rules.ts lib/saylen.ts; do
    case $f in *.css) c="/*"; e=" */";; *) c="//"; e="";; esac
    { echo "$c GENERATED from $T/$f by tools/kortteli/sync.sh: edit that file, not this copy.$e"; cat $T/$f; } > games/$g/$f
  done
  { echo "// GENERATED from games/talot/lib/house.ts by tools/kortteli/sync.sh: edit that file, not this copy."; cat games/talot/lib/house.ts; } > games/$g/lib/house.ts
done
echo synced
