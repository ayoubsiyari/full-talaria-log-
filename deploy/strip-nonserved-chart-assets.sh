#!/bin/sh
# Remove the parts of the chart tree that no browser ever requests, from a built image.
#
# WHY THIS EXISTS
# The served /chart/ tree measured 36,127,529 bytes in the running b113 homepage image. Half of
# it is the multichart regression harness (gate logs, evidence JSON, scenario files), colocated
# *.test.mjs unit tests, and editor backups. None of it is reachable from any production entry
# point, but all of it ships to the browser's script cache and is on the critical path of the
# image build and every cold page load.
#
# WHAT IT DOES NOT DO
# It does not touch node_modules or *.map, because neither is in the served tree to begin with:
# the root .dockerignore already excludes `**/node_modules`, and every *.map in the repo lives
# under the harness's node_modules. Measured, in the running image: 0 node_modules dirs, 0 .map
# files. Two of the three things this was originally scoped to remove were already gone.
#
# SAFETY, MEASURED NOT ASSUMED
# Every distinct /chart/* path requested on the live canary was collected from the access log
# (132 paths, including the multichart panel surface: chart-embed.html, embed-bridge.js,
# panel-cmd-bridge.js, sync-bridge.js). This strip was applied to a copy of the real served tree
# and all 132 still resolved. The manifest is retained as evidence and the gate asserts no
# served path can match these patterns.
#
# Usage: strip-nonserved-chart-assets.sh <chart-tree-root>
set -e

ROOT="${1:?usage: strip-nonserved-chart-assets.sh <chart-tree-root>}"
[ -d "$ROOT" ] || { echo "strip: $ROOT is not a directory" >&2; exit 1; }

bytes() { du -sb "$ROOT" 2>/dev/null | cut -f1; }
BEFORE=$(bytes)

# Entry points the browser boots from. Checked as an INVARIANT, not as a fixed expectation:
# record which of them exist before the strip, and require those same ones afterwards. A fixed
# "these must exist" list is wrong the moment two images lay the tree out differently — the
# homepage image answers /chart/modules/multichart-manager.js with a 307 to the multichart-prod
# copy, so demanding the modules/ path would fail a build for a file that was never there.
ENTRY_POINTS="dist-v9/index.html chart.js multichart-prod/chart-embed.html
multichart-prod/embed-bridge.js multichart-prod/panel-cmd-bridge.js
multichart-prod/sync-bridge.js multichart-prod/multichart-manager.js
modules/multichart-manager.js dist-v9/assets"

PRESENT_BEFORE=""
for f in $ENTRY_POINTS; do
  [ -e "$ROOT/$f" ] && PRESENT_BEFORE="$PRESENT_BEFORE $f"
done
# If none of them are here, $ROOT is not a chart tree and deleting inside it is not safe.
[ -n "$PRESENT_BEFORE" ] || { echo "strip: REFUSING - $ROOT has no chart entry points; wrong root?" >&2; exit 1; }

# The regression harness. Its own frozen/ subtree goes with it.
rm -rf "$ROOT/multichart-prod/harness"

# Colocated tests and editor backups, anywhere in the tree.
find "$ROOT" -type f \( -name '*.test.mjs' -o -name '*.bak' -o -name '*.backup' \) -delete

# Belt and braces: if a future base image or dependency change ever lands these in the served
# tree, they should not survive either. Today both find nothing.
find "$ROOT" -type f -name '*.map' -delete
find "$ROOT" -type d -name node_modules -prune -exec rm -rf {} + 2>/dev/null || true

AFTER=$(bytes)

# Anything that was an entry point before the strip must still be one after it. Removing one is a
# broken tree, so fail the build rather than ship it.
for f in $PRESENT_BEFORE; do
  [ -e "$ROOT/$f" ] || { echo "strip: REFUSING - removed a required entry point: $f" >&2; exit 1; }
done

echo "strip: $ROOT  $BEFORE -> $AFTER bytes (saved $((BEFORE-AFTER)), entry points kept:$PRESENT_BEFORE)"
