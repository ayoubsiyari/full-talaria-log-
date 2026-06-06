#!/usr/bin/env bash
# Lightweight CPU/memory monitor for the Talaria stack (run from repo root on the VPS).
#
# Logs a `docker stats` snapshot every INTERVAL seconds to logs/cpu-monitor.log and
# prints a WARN line whenever any container exceeds CPU_THRESHOLD percent. QuestDB has
# historically been the top consumer, so this is the alarm for it regressing.
#
# Usage:
#   ./scripts/cpu-monitor.sh                  # 30s interval, warn above 60% CPU
#   INTERVAL=10 CPU_THRESHOLD=40 ./scripts/cpu-monitor.sh
#   nohup ./scripts/cpu-monitor.sh >/dev/null 2>&1 &   # run in background
set -euo pipefail

ROOT="${ROOT:-.}"
cd "$ROOT"

INTERVAL="${INTERVAL:-30}"
CPU_THRESHOLD="${CPU_THRESHOLD:-60}"
LOG_DIR="${LOG_DIR:-logs}"
LOG_FILE="${LOG_DIR}/cpu-monitor.log"

mkdir -p "$LOG_DIR"
echo "cpu-monitor: interval=${INTERVAL}s threshold=${CPU_THRESHOLD}% -> ${LOG_FILE}"

while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # NAME CPU% MEM% — strip the % so we can compare numerically.
  stats="$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemPerc}}')"
  echo "[$ts]" >> "$LOG_FILE"
  echo "$stats" >> "$LOG_FILE"

  while read -r name cpu mem; do
    [ -z "${name:-}" ] && continue
    cpu_val="${cpu%\%}"
    # Integer compare (drop decimals) so this works without bc.
    if [ "${cpu_val%.*}" -ge "$CPU_THRESHOLD" ] 2>/dev/null; then
      echo "[$ts] WARN top-cpu: $name at ${cpu} (mem ${mem})" | tee -a "$LOG_FILE"
    fi
  done <<< "$stats"

  sleep "$INTERVAL"
done
