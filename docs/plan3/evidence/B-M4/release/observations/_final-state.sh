#!/bin/sh
echo "live_pin=$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null)"
echo "prior_pin=$(cat /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null)"
curl -s -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -o "__TALARIA_CHART_BUILD_ID='[^']*'" | head -1
echo "--- artifacts retained ---"
ls -1 /root/talaria-restore/images/ | grep -E 'b10[0-9]'
echo "--- images ---"
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'canary-20260729b10[0-9]' | sort
echo "--- preferences endpoint, unauthenticated (401/422 = alive, 500 = the old defect) ---"
curl -s -o /dev/null -w 'prefs_unauth_status=%{http_code}\n' http://127.0.0.1:3000/api/chart/preferences
echo "--- backend errors for that column since the repair ---"
docker logs talaria-journal-backend-1 --since 9h 2>&1 | grep -c 'indicator_settings_templates does not exist'
