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
BACKUP=/root/talaria-restore/nginx.local.conf.prev
LOG=/root/talaria-restore/NGINX-BIGJSON.log
MARK_BEGIN='TALARIA-BIGJSON-NO-TEMP-FILE BEGIN'
MARK_END='TALARIA-BIGJSON-NO-TEMP-FILE END'
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
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" \
      'index($0,b){skip=1} !skip{print} index($0,e){skip=0}' "$BACKUP" > "$CONF"
    apply off
    echo "off — big-JSON routes back to inherited buffering (temp files allowed)"
    ;;
  on)
    [ "$(present_in_file)" = yes ] && { echo "already on"; exit 0; }
    [ -f "$PRISTINE" ] || { echo "no pristine copy at $PRISTINE; re-ship the conf" >&2; exit 1; }
    cp "$CONF" "$BACKUP"
    cp "$PRISTINE" "$CONF"
    apply on
    echo "on — big-JSON routes buffer in memory, never to disk"
    ;;
  *)
    echo "usage: $0 {on|off|status}" >&2; exit 2 ;;
esac
