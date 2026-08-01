#!/bin/sh
# SESSION-STATE-BODY-BUFFER kill-switch for the live canary.  CKPT-01 point 3.
#
# `client_body_buffer_size 1m` on `location ^~ /api/sessions` keeps a session-state write in
# memory instead of spooling it to /var/cache/nginx/client_temp. A live state measured
# 636,776 bytes against nginx's 8-16k default, so every autosave of a working session was a
# disk write. Measurement: docs/plan3/evidence/B-M4/release/FINDING-B1-CONF01-NETWORK-CENSUS-20260730-1430.md
#
# nginx has no runtime flag for this, so the switch is the marked config region itself.
#
# WHY THIS IS SURGICAL IN BOTH DIRECTIONS, unlike its sibling:
# canary-nginx-bigjson-switch.sh restores a whole-file `pristine` copy on `on`. That copy was
# taken on 29 July, so running it today would silently revert this landing — the PURGE-2
# failure mode named in AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445 §3, where a
# kill-switch reverted a fix nobody knew had shipped. This script only ever adds or removes
# the region between its own markers, so it cannot disturb another directive in the file.
#
# Usage: canary-nginx-sessionstate-buffer-switch.sh {on|off|status}
set -e

CONF=/opt/talaria/homepage/nginx.local.conf
SNIPPET=/root/talaria-restore/nginx.sessionstate-buffer.snippet
BACKUP=/root/talaria-restore/nginx.local.conf.prev-sessionstate
LOG=/root/talaria-restore/NGINX-SESSIONSTATE-BUFFER.log
MARK_BEGIN='TALARIA-SESSION-STATE-BODY-BUFFER BEGIN'
MARK_END='TALARIA-SESSION-STATE-BODY-BUFFER END'
ANCHOR='location ^~ /api/sessions {'
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

container() { docker ps --format '{{.Names}}' | grep -m1 homepage; }

present_in_file() { grep -qF "$MARK_BEGIN" "$CONF" && echo yes || echo no; }

# Read the directive back out of the RUNNING config, not the file on disk: the point of the
# switch is what nginx is enforcing.
present_in_nginx() {
  C=$(container)
  [ -n "$C" ] || { echo unknown; return; }
  if docker exec "$C" nginx -T 2>/dev/null | grep -qF 'client_body_buffer_size 1m'; then
    echo yes
  else
    echo no
  fi
}

# Validate the candidate in the running container, then reload. On any failure put the
# previous file back and reload that instead, so a bad flip cannot take the site down.
apply() {
  C=$(container)
  [ -n "$C" ] || { echo "no homepage container running" >&2; exit 1; }
  if ! docker exec "$C" nginx -t >/tmp/sessionstate-nginx-t.log 2>&1; then
    echo "nginx -t REJECTED the candidate config; rolling back" >&2
    sed -n '$p' /tmp/sessionstate-nginx-t.log >&2
    cp "$BACKUP" "$CONF"
    docker exec "$C" nginx -t >/dev/null 2>&1 && docker exec "$C" nginx -s reload
    echo "$NOW APPLY_REJECTED rolled back" >> "$LOG"
    exit 1
  fi
  docker exec "$C" nginx -s reload
  echo "$NOW APPLIED state=$1 in_file=$(present_in_file) in_nginx=$(present_in_nginx)" >> "$LOG"
}

# Save the marked region so `on` can reinsert exactly what was removed.
save_snippet() {
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" \
    'index($0,b){keep=1} keep{print} index($0,e){keep=0}' "$CONF" > "$SNIPPET"
  [ -s "$SNIPPET" ] || { echo "refusing to continue: snippet came out empty" >&2; exit 1; }
}

case "${1:-status}" in
  status)
    echo "in_file=$(present_in_file)"
    echo "in_nginx=$(present_in_nginx)"
    echo "snippet_saved=$([ -s "$SNIPPET" ] && echo yes || echo no)"
    tail -3 "$LOG" 2>/dev/null
    ;;
  off)
    [ "$(present_in_file)" = no ] && { echo "already off"; exit 0; }
    cp "$CONF" "$BACKUP"
    save_snippet
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" \
      'index($0,b){skip=1} !skip{print} index($0,e){skip=0}' "$BACKUP" > "$CONF"
    grep -qF "$MARK_BEGIN" "$CONF" && { echo "strip failed; restoring" >&2; cp "$BACKUP" "$CONF"; exit 1; }
    apply off
    echo "off — session-state writes fall back to the 8-16k default and spool to disk"
    ;;
  on)
    [ "$(present_in_file)" = yes ] && { echo "already on"; exit 0; }
    [ -s "$SNIPPET" ] || { echo "no snippet at $SNIPPET; re-ship the conf" >&2; exit 1; }
    cp "$CONF" "$BACKUP"
    # Reinsert the region immediately after the /api/sessions location opener. Only this
    # region is touched; every other directive in the file is copied through byte for byte.
    awk -v anchor="$ANCHOR" -v snip="$SNIPPET" '
      { print }
      index($0, anchor) && !done {
        while ((getline line < snip) > 0) print line
        close(snip); done = 1
      }
    ' "$BACKUP" > "$CONF"
    grep -qF "$MARK_BEGIN" "$CONF" || { echo "reinsert failed; restoring" >&2; cp "$BACKUP" "$CONF"; exit 1; }
    apply on
    echo "on — session-state writes buffer in memory up to 1m"
    ;;
  *)
    echo "usage: $0 {on|off|status}" >&2; exit 2 ;;
esac
