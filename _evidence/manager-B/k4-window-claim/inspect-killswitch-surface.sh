#!/bin/sh
# What does a kill-switch actually touch, and is anything live that a restart would disturb?
# Read-only. Nothing here mutates the host.
set -u
CHART=talaria-trading-chart-1

echo "=== compose dir and env file ==="
for d in /root/talaria-trading /opt/talaria-trading /root/talaria /srv/talaria; do
  [ -d "$d" ] && echo "dir: $d" && ls -la "$d"/.env* 2>/dev/null
done
ENVF=$(docker inspect "$CHART" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null)
echo "compose working_dir from container label: ${ENVF:-unknown}"
[ -n "$ENVF" ] && ls -la "$ENVF"/.env 2>/dev/null && echo "sha256: $(sha256sum "$ENVF"/.env 2>/dev/null)"

echo
echo "=== kill-switch variables currently in the RUNNING container ==="
docker exec "$CHART" env 2>/dev/null | grep -i "TALARIA_DISABLE\|DISABLE_" || echo "(none set - switches are all off, which is the product default)"

echo
echo "=== kill-switch names the code knows about ==="
docker exec "$CHART" sh -c 'grep -rhoE "TALARIA_DISABLE_[A-Z0-9_]+" /app --include=*.py --include=*.js 2>/dev/null | sort -u' || true

echo
echo "=== is C's soak live? (a restart would destroy it) ==="
echo -n "browser processes on host: "; ps -eo comm | grep -icE 'chrome|chromium|firefox' || true
echo -n "node processes on host:    "; ps -eo comm | grep -cx node || true
echo -n "established remote conns to :3000: "
ss -tn state established '( sport = :3000 )' 2>/dev/null | grep -vc '127.0.0.1' || true
echo "chart container uptime: $(docker inspect "$CHART" --format '{{.State.StartedAt}}')"
echo "loadavg: $(cat /proc/loadavg)"
echo -n "chart container CPU: "; docker stats --no-stream --format '{{.CPUPerc}}' "$CHART" 2>/dev/null || true

echo
echo "=== recent request activity (is someone driving it?) ==="
docker logs --since 3m "$CHART" 2>&1 | wc -l | sed 's/^/log lines in last 3 min: /'
