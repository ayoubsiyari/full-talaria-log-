#!/bin/sh
# BIGJSON-NO-TEMP-FILE kill-switch for the live canary.
#
# The /api/file/{id}/(smart|candles|bars|candles.msgpack) block in
# homepage/nginx.local.conf stops multi-MB candle responses being spooled to a
# temp file on disk. nginx has no runtime flag for this, so the switch is the
# config block itself: `off` removes it and reloads, `on` restores it and reloads.
#
# Both directions validate with `nginx -t` inside the running container FIRST and
# restore the previous file if validation fails, so a bad flip cannot take the
# site down. Neither direction recreates a container, so the live build stamp on
# the wire is untouched — that matters while the PO is measuring.
#
# Usage: canary-nginx-bigjson-switch.sh {on|off|status}
set -e

CONF=/opt/talaria/homepage/nginx.local.conf
PRISTINE=/root/talaria-restore/nginx.local.conf.bigjson-on
SNIPPET=/root/talaria-restore/nginx.bigjson.snippet
BACKUP=/root/talaria-restore/nginx.local.conf.prev
LOG=/root/talaria-restore/NGINX-BIGJSON.log
MARK_BEGIN='TALARIA-BIGJSON-NO-TEMP-FILE BEGIN'
MARK_END='TALARIA-BIGJSON-NO-TEMP-FILE END'
ANCHOR='location ^~ /api/file/ {'
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

container() { docker ps --format '{{.Names}}' | grep -m1 homepage; }

present_in_file() { grep -qF "$MARK_BEGIN" "$CONF" && echo yes || echo no; }
present_in_nginx() {
  C=$(container)
  [ -n "$C" ] || { echo unknown; return; }
  if docker exec "$C" nginx -T 2>/dev/null | grep -qF 'proxy_max_temp_file_size 0'; then
    echo yes
  else
    echo no
  fi
}

# Validate the candidate file in the running container, then reload. On any
# failure put the previous file back and reload that instead.
apply() {
  C=$(container)
  [ -n "$C" ] || { echo "no homepage container running" >&2; exit 1; }
  if ! docker exec "$C" nginx -t >/tmp/bigjson-nginx-t.log 2>&1; then
    echo "nginx -t REJECTED the new config; rolling back" >&2
    sed -n '$p' /tmp/bigjson-nginx-t.log >&2
    cp "$BACKUP" "$CONF"
    docker exec "$C" nginx -t >/dev/null 2>&1 && docker exec "$C" nginx -s reload
    echo "$NOW APPLY_REJECTED rolled back" >> "$LOG"
    exit 1
  fi
  docker exec "$C" nginx -s reload
  echo "$NOW APPLIED state=$1 block_in_file=$(present_in_file) block_in_nginx=$(present_in_nginx)" >> "$LOG"
}

case "${1:-status}" in
  status)
    echo "block_in_file=$(present_in_file)"
    echo "block_in_nginx=$(present_in_nginx)"
    echo "pristine_saved=$([ -f "$PRISTINE" ] && echo yes || echo no)"
    tail -3 "$LOG" 2>/dev/null
    ;;
  off)
    [ "$(present_in_file)" = no ] && { echo "already off"; exit 0; }
    cp "$CONF" "$BACKUP"
    [ -f "$PRISTINE" ] || cp "$CONF" "$PRISTINE"
    # Save the marked region so `on` can put back exactly what was taken out.
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" \
      'index($0,b){keep=1} keep{print} index($0,e){keep=0}' "$CONF" > "$SNIPPET"
    [ -s "$SNIPPET" ] || { echo "refusing to continue: snippet came out empty" >&2; exit 1; }
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" \
      'index($0,b){skip=1} !skip{print} index($0,e){skip=0}' "$BACKUP" > "$CONF"
    apply off
    echo "off — big-JSON routes back to inherited buffering (temp files allowed)"
    ;;
  on)
    [ "$(present_in_file)" = yes ] && { echo "already on"; exit 0; }
    cp "$CONF" "$BACKUP"
    # Reinsert ONLY the marked region. This used to copy $PRISTINE over the whole file, which
    # meant a flip silently reverted every unrelated directive that had landed since the
    # pristine copy was taken — it would have reverted the session-state body buffer that
    # landed 2026-07-30. That is the PURGE-2 failure mode named in
    # AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445 §3: a kill-switch that reverts a fix
    # nobody knew had shipped. The block is the only nested location inside /api/file/, so
    # reinserting it after that opener is positionally equivalent to where it was.
    if [ -s "$SNIPPET" ]; then
      awk -v anchor="$ANCHOR" -v snip="$SNIPPET" '
        { print }
        index($0, anchor) && !done {
          while ((getline line < snip) > 0) print line
          close(snip); done = 1
        }
      ' "$BACKUP" > "$CONF"
    elif [ -f "$PRISTINE" ]; then
      # No snippet yet (never flipped off since this change): fall back to the pristine copy,
      # but say so, because it can carry unrelated reverts.
      echo "WARNING: no snippet at $SNIPPET; falling back to whole-file $PRISTINE." >&2
      echo "WARNING: diff it against the live conf before trusting this flip." >&2
      cp "$PRISTINE" "$CONF"
    else
      echo "no snippet and no pristine copy; re-ship the conf" >&2; exit 1
    fi
    grep -qF "$MARK_BEGIN" "$CONF" || { echo "reinsert failed; restoring" >&2; cp "$BACKUP" "$CONF"; exit 1; }
    apply on
    echo "on — big-JSON routes buffer in memory, never to disk"
    ;;
  *)
    echo "usage: $0 {on|off|status}" >&2; exit 2 ;;
esac
