#!/usr/bin/env bash
# Copies Talot's house data (games/talot/lib/house.ts) into Korttelikauppa as
# games/kortteli/lib/house.ts (a game can only import files from its own
# folder). Run after changing Talot's houses.
set -euo pipefail
cd "$(dirname "$0")/../.."
{ echo "// GENERATED from games/talot/lib/house.ts by tools/kortteli/sync.sh: edit that file, not this copy."; cat games/talot/lib/house.ts; } > games/kortteli/lib/house.ts
echo synced
