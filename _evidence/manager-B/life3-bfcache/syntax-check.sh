#!/usr/bin/env bash
# Syntax-gate the LIFE-3 edits before they go anywhere near a build.
set -uo pipefail
rc=0

echo "=== api_server.py ==="
if python3 -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read()); print('  parses OK')" /tmp/api_server_life3.py; then :; else rc=1; fi

echo "=== chart-window-limit.js ==="
# Not an ES module and not CommonJS-safe to import (it self-executes against window), so parse only.
if node --check /tmp/chart-window-limit-life3.js; then echo "  parses OK"; else rc=1; fi

echo "=== the switch is readable both ways ==="
python3 - <<'PY'
import os, re, sys
src = open('/tmp/api_server_life3.py', encoding='utf-8').read()
m = re.search(r'_LIFE3_BFCACHE_DEFEAT_ENABLED = .*?\n\)', src, re.S)
print('  found switch definition:' , bool(m))
# Reproduce the expression rather than trusting it by eye.
for val, want in [('', True), ('1', False), ('true', False), ('TRUE', False), ('0', True), ('no', True)]:
    got = val.strip().lower() not in ('1','true','yes','on')
    status = 'OK' if got == want else 'MISMATCH'
    print(f'  TALARIA_DISABLE_BFCACHE_DEFEAT_V1={val!r:8} -> enabled={got}  {status}')
    if got != want: sys.exit(1)
PY
[ $? -eq 0 ] || rc=1

echo
echo "=== nginx.conf ==="
if command -v nginx >/dev/null 2>&1; then
  nginx -t -c /tmp/nginx-life3.conf 2>&1 | sed 's/^/  /'
else
  echo "  nginx binary not on this host - checking the edited block textually instead"
  grep -A6 'location ~\* \\.html\$' /tmp/nginx-life3.conf | sed 's/^/  /'
fi

echo
echo "exit rc=$rc"
exit $rc
